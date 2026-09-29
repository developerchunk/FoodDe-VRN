-- Meal times for menu items.
--
-- A dish with a meal window of its own is governed by that window ALONE. The
-- kitchen's opening time says when it starts cooking, not when breakfast stops
-- being breakfast -- so a 07:00 breakfast is orderable at 07:00 even though the
-- shutters go up at 08:00. A dish marked "all_day" has no window and falls back
-- to the kitchen's hours, which is what every dish gets until somebody says
-- otherwise, so applying this migration changes no dish's availability.
--
-- Sunday-off is the exception: a kitchen that does not work on Sunday is shut,
-- not merely unopened, and no meal window can put its food on the menu.
--
-- The windows are rows, not constants in a function, because they are a
-- business decision that will be argued about and changed. Changing one is an
-- UPDATE, not a migration.

create table if not exists public.meal_windows (
  slot        text primary key,
  label       text not null,
  -- null/null means "no restriction": that is how all_day is expressed, and it
  -- is also the safe reading of a window nobody has filled in.
  starts_at   time,
  ends_at     time,
  sort_order  int not null default 0
);

insert into public.meal_windows (slot, label, starts_at, ends_at, sort_order) values
  ('all_day',   'All day',   null,    null,    0),
  ('breakfast', 'Breakfast', '07:00', '11:00', 1),
  ('brunch',    'Brunch',    '10:00', '13:00', 2),
  ('lunch',     'Lunch',     '12:00', '16:00', 3),
  ('dinner',    'Dinner',    '19:00', '23:00', 4)
on conflict (slot) do nothing;

alter table public.meal_windows enable row level security;
-- No policies: only the SECURITY DEFINER functions below read this.
revoke all on table public.meal_windows from anon, authenticated;

alter table public.menu_items
  add column if not exists meal_time text not null default 'all_day';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_meal_time_fkey') then
    alter table public.menu_items
      add constraint menu_items_meal_time_fkey
      foreign key (meal_time) references public.meal_windows (slot);
  end if;
end $$;

-- ------------------------------------------------------- is the meal window on
-- Takes the window as arguments rather than reading the table, for the same
-- reason kitchen_is_open does: it stays immutable, and it can be asked a
-- question about an arbitrary instant without any rows existing.
create or replace function public.meal_is_on(
  p_slot   text,
  p_starts time,
  p_ends   time,
  p_at     timestamptz default now()
) returns boolean
language sql
immutable
set search_path = public
as $$
  with ist as (select (p_at at time zone 'Asia/Kolkata') as t)
  select case
    -- all_day, an unknown slot, or a window nobody filled in: no restriction.
    when p_slot is null or p_slot = 'all_day' then true
    when p_starts is null or p_ends is null then true
    when p_ends > p_starts
      then (select t::time from ist) between p_starts and p_ends
    -- window that runs past midnight, e.g. a 22:00-02:00 late supper
    else (select t::time from ist) >= p_starts
      or (select t::time from ist) <= p_ends
  end;
$$;

revoke all on function public.meal_is_on(text, time, time, timestamptz) from public;
grant execute on function public.meal_is_on(text, time, time, timestamptz)
  to anon, authenticated;

-- ------------------------------------------------------ is the dish orderable
-- One place decides, so get_menu and place_order cannot drift apart about it.
create or replace function public.dish_is_on(
  p_slot       text,
  p_starts     time,
  p_ends       time,
  p_opens      time,
  p_closes     time,
  p_sunday_off boolean,
  p_at         timestamptz default now()
) returns boolean
language sql
immutable
set search_path = public
as $$
  with ist as (select (p_at at time zone 'Asia/Kolkata') as t)
  select case
    -- Shut for the day beats any window.
    when p_sunday_off and extract(dow from (select t from ist)) = 0 then false
    -- Has a window of its own: the window is the whole answer.
    when p_slot is not null and p_slot <> 'all_day'
         and p_starts is not null and p_ends is not null
      then public.meal_is_on(p_slot, p_starts, p_ends, p_at)
    -- all_day, or a window nobody filled in: the kitchen's hours decide.
    else public.kitchen_is_open(p_opens, p_closes, p_sunday_off, p_at)
  end;
$$;

revoke all on function
  public.dish_is_on(text, time, time, time, time, boolean, timestamptz) from public;
grant execute on function
  public.dish_is_on(text, time, time, time, time, boolean, timestamptz)
  to anon, authenticated;

-- ------------------------------------------------------------------- the menu
-- Dropped rather than replaced: the returned columns change, and
-- `create or replace` cannot alter a function's return type. Replacing a
-- function whose signature differs creates an OVERLOAD instead, which is how
-- 0004 broke get_menu for every anonymous browser.
drop function if exists public.get_menu();

create function public.get_menu()
returns table (
  id                text,
  category_id       text,
  category_slug     text,
  category_name     text,
  name              text,
  description       text,
  price_paise       int,
  ingredients       text,
  cooking_time_mins int,
  is_sattvic        boolean,
  is_spicy          boolean,
  is_loved          boolean,
  image_url         text,
  is_available_now  boolean,
  meal_time         text,
  meal_label        text,
  meal_starts_at    time,
  meal_ends_at      time,
  sort_order        int,
  category_sort     int
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.category_id, c.slug, c.name, m.name, m.description,
         m.price_paise, m.ingredients, m.cooking_time_mins,
         m.is_sattvic, m.is_spicy, m.is_loved, m.image_url,
         (m.is_available
          and k.is_active
          and public.dish_is_on(m.meal_time, w.starts_at, w.ends_at,
                                k.opens_at, k.closes_at, k.is_sunday_off)),
         m.meal_time, coalesce(w.label, 'All day'), w.starts_at, w.ends_at,
         m.sort_order, c.sort_order
    from public.menu_items m
    join public.categories c on c.id = m.category_id
    join public.kitchens   k on k.id = m.kitchen_id
    left join public.meal_windows w on w.slot = m.meal_time
   where c.is_active
   order by c.sort_order, m.sort_order, m.name;
$$;

revoke all on function public.get_menu() from public;
grant execute on function public.get_menu() to anon, authenticated;

-- ---------------------------------------------------------------- placing one
-- The browser must never be the only thing enforcing this. Same body as 0007,
-- with the meal window folded into the per-line `ok` test.
create or replace function public.place_order(
  p_address_code text,
  p_items        jsonb,      -- [{"id": "<menu id>", "qty": 2}, ...]
  p_guest        jsonb,      -- {"name","phone","email"}
  p_coupon       text default null,
  p_donate       boolean default false,
  p_note         text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_addr     public.addresses%rowtype;
  v_name     text := trim(coalesce(p_guest ->> 'name', ''));
  v_phone    text := regexp_replace(coalesce(p_guest ->> 'phone', ''), '\D', '', 'g');
  v_email    text := nullif(trim(coalesce(p_guest ->> 'email', '')), '');
  v_lines    jsonb;
  v_wanted   int;
  v_bad      text;
  v_subtotal int;
  v_bill     jsonb;
  v_order_id uuid;
  v_order_no text;
  v_token    uuid;
begin
  -- A guest is anonymous but still signed in; the order has to belong to
  -- somebody or it can never be shown back to them.
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into v_addr from public.addresses
   where id = p_address_code and is_active;
  if not found then
    raise exception 'that room code is not valid' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'a name is required' using errcode = '22023';
  end if;
  if v_phone !~ '^[6-9][0-9]{9}$' then
    raise exception 'a valid 10-digit mobile number is required' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'that e-mail address is not valid' using errcode = '22023';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'the order is empty' using errcode = '22023';
  end if;

  /* Resolve the requested dishes against the database in one go. Quantities
     are summed per dish, so a client that sends the same id twice cannot
     produce two line items for it. No temp table: this function must be safe
     to call twice inside one transaction. */
  with req as (
    select i ->> 'id' as id,
           greatest(1, least(20, sum(coalesce((i ->> 'qty')::int, 0)))) as qty
      from jsonb_array_elements(p_items) i
     group by i ->> 'id'
  )
  select count(*) filter (where true),
         coalesce(jsonb_agg(jsonb_build_object(
           'id',          m.id,
           'kitchen_id',  m.kitchen_id,
           'name',        m.name,
           'price_paise', m.price_paise,
           'qty',         r.qty,
           'ok',          (m.is_available and k.is_active
                           and public.dish_is_on(m.meal_time, w.starts_at, w.ends_at,
                                                 k.opens_at, k.closes_at, k.is_sunday_off))
         )), '[]'::jsonb)
    into v_wanted, v_lines
    from req r
    join public.menu_items m on m.id = r.id
    join public.kitchens   k on k.id = m.kitchen_id
    -- left, so a slot with no window row cannot silently drop the line;
    -- meal_is_on treats an absent window as no restriction.
    left join public.meal_windows w on w.slot = m.meal_time;

  if v_wanted <> (select count(distinct i ->> 'id') from jsonb_array_elements(p_items) i) then
    raise exception 'one of those dishes is no longer on the menu' using errcode = '22023';
  end if;

  -- A kitchen that closed, or a dish now outside its meal hours, since the
  -- page loaded must not be given work.
  select string_agg(l.name, ', ')
    into v_bad
    from jsonb_to_recordset(v_lines) as l(name text, ok boolean)
   where not l.ok;
  if v_bad is not null then
    raise exception 'no longer available: %', v_bad using errcode = '22023';
  end if;

  -- The price comes from the database, never from the request body.
  select sum(l.price_paise * l.qty)
    into v_subtotal
    from jsonb_to_recordset(v_lines) as l(price_paise int, qty int);

  v_bill := public.price_order(v_subtotal, p_coupon, p_donate);

  v_order_no := 'IRD-'
    || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-'
    || upper(substr(public.new_code(), 1, 4));
  v_token := gen_random_uuid();

  insert into public.orders (
    order_no, receipt_token, address_id, guest_user_id,
    guest_name, guest_phone, guest_email, status,
    subtotal_paise, discount_paise, coupon_code,
    delivery_paise, packing_paise, tax_paise, total_paise, note
  ) values (
    v_order_no, v_token, v_addr.id, v_uid,
    v_name, v_phone, v_email, 'pending_payment',
    (v_bill ->> 'subtotal_paise')::int,
    (v_bill ->> 'discount_paise')::int,
    v_bill ->> 'coupon_code',
    (v_bill ->> 'delivery_paise')::int,
    (v_bill ->> 'packing_paise')::int,
    (v_bill ->> 'tax_paise')::int,
    (v_bill ->> 'total_paise')::int,
    nullif(trim(coalesce(p_note, '')), '')
  ) returning id into v_order_id;

  insert into public.order_items
    (order_id, menu_item_id, kitchen_id, name_snapshot, unit_price_paise, qty, line_total_paise)
  select v_order_id, l.id, l.kitchen_id, l.name, l.price_paise, l.qty, l.price_paise * l.qty
    from jsonb_to_recordset(v_lines)
      as l(id text, kitchen_id text, name text, price_paise int, qty int);

  -- One ticket per kitchen involved. This is the unit that later gets sent to
  -- a kitchen and tracked, and it is why menu_items carries kitchen_id at all.
  insert into public.order_tickets (order_id, kitchen_id)
  select distinct v_order_id, l.kitchen_id
    from jsonb_to_recordset(v_lines) as l(kitchen_id text);

  return jsonb_build_object(
    'order_no',      v_order_no,
    'receipt_token', v_token,
    'status',        'pending_payment',
    -- expected, from the lines we resolved
    'kitchens',      (select count(distinct l.kitchen_id)
                        from jsonb_to_recordset(v_lines) as l(kitchen_id text)),
    -- actual, counted from the rows this function just wrote. The two must
    -- agree; reporting only the expectation proves nothing about the insert.
    'tickets',       (select count(*) from public.order_tickets
                       where order_id = v_order_id),
    'bill',          v_bill
  );
end $$;

revoke all on function public.place_order(text, jsonb, jsonb, text, boolean, text) from public;
grant execute on function public.place_order(text, jsonb, jsonb, text, boolean, text)
  to anon, authenticated;

-- ------------------------------------------------------------- self-check
-- Fails the migration rather than leaving a quietly wrong window behind.
do $$
declare
  cases constant jsonb := jsonb_build_array(
    -- slot, starts, ends, instant (UTC), expected, why
    jsonb_build_array('all_day',   null,    null,    '2026-09-28T21:30:00Z', true,  'all day, 03:00 IST'),
    jsonb_build_array('breakfast', '07:00', '11:00', '2026-09-28T02:30:00Z', true,  'breakfast at 08:00 IST'),
    jsonb_build_array('breakfast', '07:00', '11:00', '2026-09-28T06:30:00Z', false, 'breakfast at 12:00 IST'),
    jsonb_build_array('lunch',     '12:00', '16:00', '2026-09-28T06:30:00Z', true,  'lunch at 12:00 IST'),
    jsonb_build_array('dinner',    '19:00', '23:00', '2026-09-28T14:30:00Z', true,  'dinner at 20:00 IST'),
    jsonb_build_array('dinner',    '19:00', '23:00', '2026-09-28T02:30:00Z', false, 'dinner at 08:00 IST'),
    jsonb_build_array('supper',    '22:00', '02:00', '2026-09-28T19:30:00Z', true,  'past midnight, 01:00 IST'),
    jsonb_build_array('supper',    '22:00', '02:00', '2026-09-28T06:30:00Z', false, 'past-midnight window, midday'),
    jsonb_build_array('breakfast', null,    null,    '2026-09-28T06:30:00Z', true,  'window not filled in: no restriction')
  );
  c jsonb;
  got boolean;
begin
  for c in select * from jsonb_array_elements(cases) loop
    select public.meal_is_on(
             c ->> 0,
             (c ->> 1)::time,
             (c ->> 2)::time,
             (c ->> 3)::timestamptz
           ) into got;
    if got is distinct from (c ->> 4)::boolean then
      raise exception 'meal_is_on wrong for %: expected %, got %',
        c ->> 5, c ->> 4, got;
    end if;
  end loop;
  raise notice 'meal_is_on: all % cases correct', jsonb_array_length(cases);
end $$;

-- The rule that actually matters: a window beats the kitchen's opening time.
do $$
declare
  cases constant jsonb := jsonb_build_array(
    -- slot, starts, ends, opens, closes, sunday_off, instant, expected, why
    jsonb_build_array('breakfast','07:00','11:00','08:00','23:00',false,'2026-09-28T02:00:00Z',true, 'breakfast at 07:30, kitchen opens 08:00'),
    jsonb_build_array('all_day',  null,   null,   '08:00','23:00',false,'2026-09-28T02:00:00Z',false,'all-day dish at 07:30, kitchen shut'),
    jsonb_build_array('all_day',  null,   null,   '08:00','23:00',false,'2026-09-28T03:30:00Z',true, 'all-day dish at 09:00'),
    jsonb_build_array('breakfast','07:00','11:00','08:00','23:00',false,'2026-09-28T06:30:00Z',false,'breakfast at 12:00 is over'),
    jsonb_build_array('dinner',   '19:00','23:00','08:00','23:00',false,'2026-09-28T18:00:00Z',false,'dinner at 23:30 is over'),
    jsonb_build_array('breakfast','07:00','11:00','08:00','23:00',true, '2026-09-27T02:00:00Z',false,'Sunday-off kitchen beats the window'),
    jsonb_build_array('breakfast','07:00','11:00','08:00','23:00',true, '2026-09-28T02:00:00Z',true, 'same kitchen on a Monday')
  );
  c jsonb;
  got boolean;
begin
  for c in select * from jsonb_array_elements(cases) loop
    select public.dish_is_on(
             c ->> 0, (c ->> 1)::time, (c ->> 2)::time,
             (c ->> 3)::time, (c ->> 4)::time, (c ->> 5)::boolean,
             (c ->> 6)::timestamptz
           ) into got;
    if got is distinct from (c ->> 7)::boolean then
      raise exception 'dish_is_on wrong for %: expected %, got %', c ->> 8, c ->> 7, got;
    end if;
  end loop;
  raise notice 'dish_is_on: all % cases correct', jsonb_array_length(cases);
end $$;
