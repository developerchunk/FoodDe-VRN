-- =============================================================================
-- 0025 — charges are settings, a minimum order, and the best coupon applies
--         itself
--
-- Delivery, packing and the free-delivery threshold were numbers written into
-- price_order() and again into the browser. They are business decisions, so
-- they move into `settings`, where the super admin changes them on the
-- Settings page and the next order is priced with the new values. Free
-- delivery starts at ₹199 from here on.
--
-- A minimum order joins them: ₹60 of food, before any coupon. The cart says
-- so, and the database refuses to write an order below it whatever the
-- browser does.
--
-- Coupons: a guest no longer has to know a code. When they have not chosen
-- one, price_order() applies the active coupon worth the most on this order.
-- A code they do choose is honoured if it applies; if it does not, they still
-- get the best one rather than nothing, and the bill says the code was refused.
--
-- price_order keeps its signature, so place_order -- which calls it inside the
-- same transaction as the insert -- picks all of this up unchanged.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- the values
insert into public.settings (key, value) values
  ('delivery_paise',            '2900'),   -- ₹29
  ('packing_paise',             '1500'),   -- ₹15
  ('free_delivery_above_paise', '19900'),  -- ₹199
  ('min_order_paise',           '6000')    -- ₹60
on conflict (key) do nothing;

-- Whole paise, nothing else. A typo here would otherwise price every order.
alter table public.settings drop constraint if exists settings_charges_shape;
alter table public.settings add constraint settings_charges_shape
  check (key not in ('delivery_paise', 'packing_paise', 'free_delivery_above_paise',
                     'min_order_paise')
         or value ~ '^[0-9]{1,7}$');

-- Reads one charge. Internal: only price_order and get_pricing call it.
create or replace function public.charge_setting(p_key text, p_default int)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select s.value::int from public.settings s
      where s.key = p_key and s.value ~ '^[0-9]{1,7}$'),
    p_default);
$$;
revoke all on function public.charge_setting(text, int) from public, anon, authenticated;

-- What the cart needs to show the charges before it has asked for a price.
-- `settings` is closed to the browser (0021), so this hands out exactly these
-- four numbers and nothing else in that table.
create or replace function public.get_pricing()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'delivery_paise',            public.charge_setting('delivery_paise', 2900),
    'packing_paise',             public.charge_setting('packing_paise', 1500),
    'free_delivery_above_paise', public.charge_setting('free_delivery_above_paise', 19900),
    'min_order_paise',           public.charge_setting('min_order_paise', 6000)
  );
$$;
revoke all on function public.get_pricing() from public;
grant execute on function public.get_pricing() to anon, authenticated;

-- ---------------------------------------------------------------- the bill
-- Every active coupon an item total qualifies for, with what it is worth on
-- it. Internal: price_order is the only caller.
create or replace function public.eligible_coupons(p_subtotal_paise int)
returns table (code text, min_order int, discount int)
language sql stable security definer set search_path = public
as $$
  select c.code, c.min_order_paise,
         least(case when c.kind = 'flat' then c.value
                    else least(round(p_subtotal_paise * c.value / 100.0)::int,
                               coalesce(c.max_discount_paise, 2147483647))
               end,
               p_subtotal_paise)
    from public.coupons c
   where c.is_active
     and p_subtotal_paise > 0
     and p_subtotal_paise >= c.min_order_paise;
$$;
revoke all on function public.eligible_coupons(int) from public, anon, authenticated;

create or replace function public.price_order(
  p_subtotal_paise int,
  p_coupon         text default null,
  p_donate         boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_requested  text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
  v_code       text := null;
  v_discount   int  := 0;
  v_auto       boolean := false;
  v_rejected   boolean := false;
  v_fee        int := public.charge_setting('delivery_paise', 2900);
  v_pack_fee   int := public.charge_setting('packing_paise', 1500);
  v_free_above int := public.charge_setting('free_delivery_above_paise', 19900);
  v_taxable    int;
  v_delivery   int;
  v_packing    int;
  v_gst        int;
  v_donation   int;
begin
  -- The guest's own choice, when it applies.
  if v_requested is not null then
    select e.code, e.discount into v_code, v_discount
      from public.eligible_coupons(p_subtotal_paise) e where e.code = v_requested;
    if not found then
      v_rejected := true;
      v_code := null;
    end if;
  end if;

  -- Otherwise the one worth the most. Ties go to the higher minimum (the
  -- offer the guest has worked harder for), then alphabetically, so the same
  -- cart always gets the same coupon.
  if v_code is null then
    select e.code, e.discount into v_code, v_discount
      from public.eligible_coupons(p_subtotal_paise) e
     where e.discount > 0
     order by e.discount desc, e.min_order desc, e.code
     limit 1;
    if found then
      v_auto := true;
    else
      v_code := null;
      v_discount := 0;
    end if;
  end if;

  v_taxable  := greatest(p_subtotal_paise - v_discount, 0);
  -- the threshold is on the item total, before any coupon
  v_delivery := case when p_subtotal_paise = 0 then 0
                     when p_subtotal_paise >= v_free_above then 0
                     else v_fee end;
  v_packing  := case when p_subtotal_paise = 0 then 0 else v_pack_fee end;
  -- to the nearest paisa; there is no smaller unit to round to, and the total
  -- is never rounded up to whole rupees
  v_gst      := round(v_taxable * 0.05)::int;
  v_donation := case when p_donate then 500 else 0 end;

  return jsonb_build_object(
    'subtotal_paise',            p_subtotal_paise,
    'discount_paise',            v_discount,
    'coupon_code',               v_code,
    'coupon_auto',               v_auto,
    'coupon_rejected',           v_rejected,
    'delivery_paise',            v_delivery,
    'packing_paise',             v_packing,
    'tax_paise',                 v_gst,
    'donation_paise',            v_donation,
    'free_delivery_above_paise', v_free_above,
    'min_order_paise',           public.charge_setting('min_order_paise', 6000),
    'total_paise',               v_taxable + v_delivery + v_packing + v_gst + v_donation
  );
end $$;

revoke all on function public.price_order(int, text, boolean) from public;
grant execute on function public.price_order(int, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------ minimum order
-- On the order row itself rather than inside place_order, so no path that
-- writes an order -- today's or a later one -- can skip it. Only new orders:
-- the ones already placed are history.
create or replace function public.enforce_min_order()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_min int := public.charge_setting('min_order_paise', 6000);
begin
  if new.subtotal_paise < v_min then
    raise exception 'The minimum order is ₹%. Please add a little more to your order.',
      case when v_min % 100 = 0 then (v_min / 100)::text
           else to_char(v_min / 100.0, 'FM999990.00') end
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_min_order() from public, anon, authenticated;

drop trigger if exists orders_min_order on public.orders;
create trigger orders_min_order
  before insert on public.orders
  for each row execute function public.enforce_min_order();

-- ---------------------------------------------------------------- self-check
-- Real coupons may exist, so the checks are about relationships, not about
-- which code wins: the automatic pick is never worth less than a coupon that
-- applies, a chosen code that applies is used, and a refused code still leaves
-- the guest with the best discount.
do $$
declare
  v_bill jsonb;
  v_fee  int := public.charge_setting('delivery_paise', 2900);
  v_free int := public.charge_setting('free_delivery_above_paise', 19900);
begin
  insert into public.coupons (code, label, min_order_paise, kind, value) values
    ('ZZAUTOBIG',   'self check', 0, 'flat', 3000),
    ('ZZAUTOSMALL', 'self check', 0, 'flat', 1000);

  v_bill := public.price_order(50000, null, false);
  if not (v_bill ->> 'coupon_auto')::boolean
     or (v_bill ->> 'discount_paise')::int < 3000 then
    raise exception 'the best coupon did not apply itself: %', v_bill;
  end if;

  v_bill := public.price_order(50000, 'zzautosmall', false);
  if (v_bill ->> 'coupon_code') is distinct from 'ZZAUTOSMALL'
     or (v_bill ->> 'coupon_auto')::boolean
     or (v_bill ->> 'discount_paise')::int <> 1000 then
    raise exception 'a chosen coupon was not honoured: %', v_bill;
  end if;

  v_bill := public.price_order(50000, 'ZZNOSUCHCODE', false);
  if not (v_bill ->> 'coupon_rejected')::boolean
     or (v_bill ->> 'discount_paise')::int < 3000 then
    raise exception 'a refused code cost the guest the best coupon: %', v_bill;
  end if;

  delete from public.coupons where code in ('ZZAUTOBIG', 'ZZAUTOSMALL');

  -- the threshold and the fee come from settings
  if v_free > 0 then
    v_bill := public.price_order(v_free - 1, null, false);
    if (v_bill ->> 'delivery_paise')::int <> v_fee then
      raise exception 'delivery below the threshold is not the set fee: %', v_bill;
    end if;
  end if;
  v_bill := public.price_order(v_free, null, false);
  if (v_bill ->> 'delivery_paise')::int <> 0 then
    raise exception 'delivery at the threshold is not free: %', v_bill;
  end if;

  if (public.get_pricing() ->> 'min_order_paise') is null then
    raise exception 'get_pricing does not report the minimum order';
  end if;

  raise notice 'price_order reads the charges and applies the best coupon';
exception
  when others then
    delete from public.coupons where code in ('ZZAUTOBIG', 'ZZAUTOSMALL');
    raise;
end $$;

commit;
