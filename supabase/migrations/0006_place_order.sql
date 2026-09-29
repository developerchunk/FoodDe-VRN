-- =============================================================================
-- 0006 — placing an order
--
-- The client is never trusted with money. It sends which dishes and how many;
-- every price, every rule and the total are recomputed here from the database.
-- A browser that posts `total_paise: 1` gets an order for the real amount.
--
-- This is a database function rather than an edge function on purpose: the
-- whole thing — validation, pricing, the order, its line items and one ticket
-- per kitchen — has to be one transaction. A half-written order that charged a
-- guest but never reached a kitchen is the worst outcome available.
-- Razorpay and WhatsApp come later and do need edge functions, because those
-- call out over HTTP.
-- =============================================================================

-- ------------------------------------------------------------------ coupons
-- In a table so the codes are not duplicated between the browser and here,
-- and so they can be changed without a deploy.
create table if not exists public.coupons (
  code              text primary key,
  label             text not null,
  min_order_paise   int  not null default 0,
  kind              text not null check (kind in ('flat', 'percent')),
  value             int  not null,           -- paise for flat, percent for percent
  max_discount_paise int,                    -- only meaningful for percent
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

insert into public.coupons (code, label, min_order_paise, kind, value, max_discount_paise)
values
  ('RADHE50',   '₹50 off on orders above ₹299',        29900, 'flat',    5000,  null),
  ('FIRSTMEAL', '15% off your first order (max ₹100)', 19900, 'percent', 15,    10000),
  ('SATTVIC20', '₹20 off any order above ₹249',        24900, 'flat',    2000,  null)
on conflict (code) do nothing;

alter table public.coupons enable row level security;

create or replace function public.get_coupons()
returns table (code text, label text, min_order_paise int)
language sql security definer set search_path = public stable
as $$
  select c.code, c.label, c.min_order_paise
    from public.coupons c
   where c.is_active
   order by c.min_order_paise;
$$;
revoke all on function public.get_coupons() from public;
grant execute on function public.get_coupons() to anon, authenticated;

-- -------------------------------------------------------------- the charges
-- One place for the rules, so the cart, the order and any later invoice cannot
-- drift apart. Everything is integer paise.
create or replace function public.price_order(
  p_subtotal_paise int,
  p_coupon         text default null,
  p_donate         boolean default false
) returns jsonb
language plpgsql stable set search_path = public
as $$
declare
  c            public.coupons%rowtype;
  v_discount   int := 0;
  v_code       text := null;
  v_taxable    int;
  v_delivery   int;
  v_packing    int;
  v_gst        int;
  v_donation   int;
begin
  if p_coupon is not null then
    select * into c from public.coupons
     where code = upper(p_coupon) and is_active;
    if found and p_subtotal_paise >= c.min_order_paise then
      v_discount := case
        when c.kind = 'flat' then c.value
        else least(round(p_subtotal_paise * c.value / 100.0)::int,
                   coalesce(c.max_discount_paise, 2147483647))
      end;
      v_discount := least(v_discount, p_subtotal_paise);
      v_code := c.code;
    end if;
  end if;

  v_taxable  := greatest(p_subtotal_paise - v_discount, 0);
  v_delivery := case when p_subtotal_paise = 0 then 0
                     when p_subtotal_paise >= 29900 then 0
                     else 2900 end;
  v_packing  := case when p_subtotal_paise = 0 then 0 else 1500 end;
  -- to the nearest paisa; there is no smaller unit to round to, and the total
  -- is never rounded up to whole rupees
  v_gst      := round(v_taxable * 0.05)::int;
  v_donation := case when p_donate then 500 else 0 end;

  return jsonb_build_object(
    'subtotal_paise', p_subtotal_paise,
    'discount_paise', v_discount,
    'coupon_code',    v_code,
    'delivery_paise', v_delivery,
    'packing_paise',  v_packing,
    'tax_paise',      v_gst,
    'donation_paise', v_donation,
    'total_paise',    v_taxable + v_delivery + v_packing + v_gst + v_donation
  );
end $$;
revoke all on function public.price_order(int, text, boolean) from public;
grant execute on function public.price_order(int, text, boolean) to anon, authenticated;

-- Store the discount rather than folding it into the subtotal, so a receipt can
-- show what was taken off. A guest who used a coupon should be able to see it.
alter table public.orders add column if not exists discount_paise int not null default 0;
alter table public.orders add column if not exists coupon_code text;

-- ---------------------------------------------------------------- the order
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
    'kitchens',      (select count(distinct l.kitchen_id)
                        from jsonb_to_recordset(v_lines) as l(kitchen_id text)),
    'bill',          v_bill
  );
end $$;

revoke all on function public.place_order(text, jsonb, jsonb, text, boolean, text) from public;
grant execute on function public.place_order(text, jsonb, jsonb, text, boolean, text)
  to anon, authenticated;

-- ------------------------------------------------------- receipt, with the
-- discount line and the room it was ordered to.
create or replace function public.get_receipt(p_token uuid)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
    'place_name', a.place_name, 'room_number', a.room_number,
    'guest_name', o.guest_name, 'guest_phone', o.guest_phone,
    'note', o.note,
    'subtotal_paise', o.subtotal_paise,
    'discount_paise', o.discount_paise,
    'coupon_code',    o.coupon_code,
    'delivery_paise', o.delivery_paise,
    'packing_paise',  o.packing_paise,
    'tax_paise',      o.tax_paise,
    'total_paise',    o.total_paise,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',   i.id,
               'name', i.name_snapshot, 'qty', i.qty,
               'unit_price_paise', i.unit_price_paise,
               'line_total_paise', i.line_total_paise
             ) order by i.name_snapshot), '[]'::jsonb)
        from public.order_items i where i.order_id = o.id)
  )
  from public.orders o
  join public.addresses a on a.id = o.address_id
  where o.receipt_token = p_token;
$$;

revoke all on function public.get_receipt(uuid) from public;
grant execute on function public.get_receipt(uuid) to anon, authenticated;
