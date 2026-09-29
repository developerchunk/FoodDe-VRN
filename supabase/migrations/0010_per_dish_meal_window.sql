-- Per-dish meal timings.
--
-- 0009 gave every slot one window shared by every dish in it. That is the wrong
-- grain: two sweets can both be "lunch" and still want different hours -- one
-- from 13:00 to 14:00, the other from 12:00 to 14:00.
--
-- So a dish may carry its own start and end. Where it does, they win; where it
-- does not, it inherits the slot's window. meal_windows stops being the rule and
-- becomes the default, which is what it should have been.
--
-- Nothing changes for existing dishes: both columns are null, so every dish
-- still inherits, exactly as before.

alter table public.menu_items
  add column if not exists meal_starts_at time,
  add column if not exists meal_ends_at   time;

do $$
begin
  -- Half a window is not a window. One column set and the other null would
  -- silently fall back to the slot default for the missing half, producing a
  -- range nobody wrote down.
  if not exists (select 1 from pg_constraint where conname = 'menu_items_meal_window_pair') then
    alter table public.menu_items
      add constraint menu_items_meal_window_pair
      check ((meal_starts_at is null) = (meal_ends_at is null));
  end if;

  -- "all day" and "from 13:00 to 14:00" cannot both be true. Rejecting the
  -- contradiction is kinder than silently picking one.
  if not exists (select 1 from pg_constraint where conname = 'menu_items_all_day_has_no_window') then
    alter table public.menu_items
      add constraint menu_items_all_day_has_no_window
      check (meal_time <> 'all_day' or meal_starts_at is null);
  end if;
end $$;

-- ------------------------------------------------------------------- the menu
-- Same columns as 0009, so this is a true replacement rather than an overload:
-- only the window each dish is measured against changes.
create or replace function public.get_menu()
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
          and public.dish_is_on(m.meal_time,
                                coalesce(m.meal_starts_at, w.starts_at),
                                coalesce(m.meal_ends_at,   w.ends_at),
                                k.opens_at, k.closes_at, k.is_sunday_off)),
         m.meal_time, coalesce(w.label, 'All day'),
         -- the window the guest is actually subject to, not the slot's default
         coalesce(m.meal_starts_at, w.starts_at),
         coalesce(m.meal_ends_at,   w.ends_at),
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
-- The same coalesce, because the browser must never be the only thing that
-- knows a dish keeps its own hours.
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
                           and public.dish_is_on(m.meal_time,
                                                 coalesce(m.meal_starts_at, w.starts_at),
                                                 coalesce(m.meal_ends_at,   w.ends_at),
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

-- ---------------------------------------------------------------- self-check
-- Proves the override actually overrides, against real rows, then removes them.
do $$
declare
  v_kitchen  text;
  v_category text;
  v_id       text := 'zzselfchk1';
  v_on       boolean;
begin
  select id into v_kitchen  from public.kitchens   limit 1;
  select id into v_category from public.categories limit 1;
  if v_kitchen is null or v_category is null then
    raise notice 'no kitchen or category to test against; skipping';
    return;
  end if;

  insert into public.menu_items
    (id, kitchen_id, category_id, name, price_paise, meal_time, meal_starts_at, meal_ends_at)
  values
    (v_id, v_kitchen, v_category, 'ZZ self check', 100, 'lunch', '13:00', '14:00');

  -- 13:30 IST on a Monday: inside the dish's own window, outside nothing else.
  select public.dish_is_on(m.meal_time,
                           coalesce(m.meal_starts_at, w.starts_at),
                           coalesce(m.meal_ends_at,   w.ends_at),
                           k.opens_at, k.closes_at, k.is_sunday_off,
                           '2026-09-28T08:00:00Z'::timestamptz)
    into v_on
    from public.menu_items m
    join public.kitchens k on k.id = m.kitchen_id
    left join public.meal_windows w on w.slot = m.meal_time
   where m.id = v_id;
  if v_on is not true then
    raise exception 'a dish inside its own 13:00-14:00 window should be on at 13:30 IST';
  end if;

  -- 12:30 IST: inside the lunch slot default (12:00-16:00) but outside this
  -- dish's own window. If the override were ignored this would be true.
  select public.dish_is_on(m.meal_time,
                           coalesce(m.meal_starts_at, w.starts_at),
                           coalesce(m.meal_ends_at,   w.ends_at),
                           k.opens_at, k.closes_at, k.is_sunday_off,
                           '2026-09-28T07:00:00Z'::timestamptz)
    into v_on
    from public.menu_items m
    join public.kitchens k on k.id = m.kitchen_id
    left join public.meal_windows w on w.slot = m.meal_time
   where m.id = v_id;
  if v_on is not false then
    raise exception 'the slot default is overriding the dish own window at 12:30 IST';
  end if;

  delete from public.menu_items where id = v_id;
  raise notice 'per-dish meal window: override wins over the slot default';
exception
  when others then
    delete from public.menu_items where id = v_id;
    raise;
end $$;
