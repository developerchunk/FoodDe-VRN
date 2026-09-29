-- =============================================================================
-- 0007 — place_order reports the tickets it actually wrote
--
-- It returned a `kitchens` count derived from the resolved lines — the number
-- of tickets it *intended* to create. Which proves nothing about whether the
-- insert happened. The split across kitchens is the mechanic the whole
-- business rests on, so it should not need a hand-written SQL query to check.
--
-- Now it returns both: `kitchens` (expected) and `tickets` (counted from
-- order_tickets after the insert). Verification can assert they match.
-- =============================================================================

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
                           and public.kitchen_is_open(k.opens_at, k.closes_at, k.is_sunday_off))
         )), '[]'::jsonb)
    into v_wanted, v_lines
    from req r
    join public.menu_items m on m.id = r.id
    join public.kitchens   k on k.id = m.kitchen_id;

  if v_wanted <> (select count(distinct i ->> 'id') from jsonb_array_elements(p_items) i) then
    raise exception 'one of those dishes is no longer on the menu' using errcode = '22023';
  end if;

  -- A kitchen that closed since the page loaded must not be given work.
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
