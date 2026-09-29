-- price_order could not read the coupons table.
--
-- It was declared stable but not security definer, so it ran as whoever called
-- it. The coupons table is deliberately unreadable from the browser -- that is
-- why get_coupons() exists and returns only code, label and minimum -- so the
-- lookup inside price_order found nothing and returned discount 0 with a null
-- coupon_code. No error and no warning: coupons simply never applied in the
-- cart, for anyone.
--
-- place_order was unaffected, because it IS security definer and the nested
-- call inherits that, so orders were charged the right amount. The damage was
-- confined to the price the guest was shown before paying, which is its own
-- kind of wrong.
--
-- Same signature, so this replaces rather than overloads.
create or replace function public.price_order(
  p_subtotal_paise int,
  p_coupon         text default null,
  p_donate         boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public
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

-- ---------------------------------------------------------------- self-check
-- Asks the function the exact question that was silently wrong.
do $$
declare
  v_bill jsonb;
begin
  insert into public.coupons (code, label, min_order_paise, kind, value)
  values ('ZZSELFCHECK', 'self check', 10000, 'flat', 2500)
  on conflict (code) do nothing;

  v_bill := public.price_order(20000, 'ZZSELFCHECK', false);
  if (v_bill ->> 'discount_paise')::int <> 2500 then
    raise exception 'price_order still cannot read coupons: %', v_bill;
  end if;
  if (v_bill ->> 'coupon_code') is distinct from 'ZZSELFCHECK' then
    raise exception 'price_order did not report the coupon: %', v_bill;
  end if;

  -- below its minimum the same coupon must do nothing
  v_bill := public.price_order(5000, 'ZZSELFCHECK', false);
  if (v_bill ->> 'discount_paise')::int <> 0 then
    raise exception 'a coupon applied below its minimum: %', v_bill;
  end if;

  delete from public.coupons where code = 'ZZSELFCHECK';
  raise notice 'price_order reads coupons correctly';
exception
  when others then
    delete from public.coupons where code = 'ZZSELFCHECK';
    raise;
end $$;
