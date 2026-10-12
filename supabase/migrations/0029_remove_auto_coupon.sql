-- =============================================================================
-- 0029 — a guest can remove the coupon that applied itself
--
-- Since 0025 a guest who picks no code gets the best coupon automatically.
-- That left no way to say "no coupon": removing it only brought it straight
-- back. price_order now tells the two apart:
--
--   p_coupon null  -> nothing chosen: the best eligible coupon applies (as before)
--   p_coupon ''    -> the guest removed it: no coupon at all
--   p_coupon 'X'   -> that code if it applies, otherwise the best one (as before)
--
-- Never more than one coupon: an order carries a single coupon_code, and
-- exactly one -- or none -- is chosen here.
--
-- place_order passes its p_coupon straight to price_order, so it follows.
-- Same signature, so this replaces rather than overloads.
-- =============================================================================

begin;

create or replace function public.price_order(
  p_subtotal_paise int,
  p_coupon         text default null,
  p_donate         boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_requested  text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
  -- '' (as opposed to null) is the guest removing the coupon: none at all
  v_declined   boolean := p_coupon is not null and trim(p_coupon) = '';
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
  if v_code is null and not v_declined then
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
    'coupon_declined',           v_declined,
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

-- ---------------------------------------------------------------- self-check
do $$
declare
  v_bill jsonb;
begin
  insert into public.coupons (code, label, min_order_paise, kind, value)
  values ('ZZDECLINE', 'self check', 0, 'flat', 1000);

  v_bill := public.price_order(50000, '', false);
  if (v_bill ->> 'discount_paise')::int <> 0 or (v_bill ->> 'coupon_code') is not null
     or not (v_bill ->> 'coupon_declined')::boolean then
    raise exception 'a removed coupon still applied: %', v_bill;
  end if;

  v_bill := public.price_order(50000, null, false);
  if not (v_bill ->> 'coupon_auto')::boolean or (v_bill ->> 'discount_paise')::int < 1000 then
    raise exception 'with nothing chosen the best coupon no longer applies: %', v_bill;
  end if;

  delete from public.coupons where code = 'ZZDECLINE';
  raise notice 'a guest can remove the automatic coupon';
exception
  when others then
    delete from public.coupons where code = 'ZZDECLINE';
    raise;
end $$;

commit;
