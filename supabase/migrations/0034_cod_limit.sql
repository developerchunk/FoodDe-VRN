-- =============================================================================
-- 0034 — cash on delivery up to ₹2,500
--
-- 0031's confirm_cod_order, plus one rule: an order totalling more than
-- ₹2,500 (250000 paise) cannot be confirmed as cash on delivery and must be
-- paid online in advance. The checkout (COD_MAX_PAISE) holds the same number.
--
-- Same signature and return type, so `create or replace` is enough.
-- =============================================================================

create or replace function public.confirm_cod_order(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_gone  text;
begin
  select * into v_order from public.orders where receipt_token = p_token for update;
  if not found or v_order.guest_user_id is distinct from auth.uid() then
    raise exception 'no such order' using errcode = '22023';
  end if;

  -- Asked twice (a double tap, a retry): the first one stands.
  if v_order.payment_method = 'cod' and v_order.status <> 'pending_payment' then
    return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no,
                              'status', v_order.status, 'already', true);
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'that order is not awaiting payment' using errcode = '22023';
  end if;

  -- Larger orders are paid online in advance. The checkout offers only that
  -- above the limit; this is what holds when the page is bypassed.
  if v_order.total_paise > 250000 then
    raise exception 'over the cash on delivery limit of 2500 rupees' using errcode = '22023';
  end if;

  -- The same rule as paying online: nothing switched off since the order was
  -- placed may reach a kitchen.
  v_gone := public.unavailable_in_order(v_order.id);
  if v_gone is not null then
    raise exception 'no longer available: %', v_gone using errcode = '22023';
  end if;

  update public.orders
     set payment_method = 'cod',
         status         = 'paid',
         paid_at        = now(),
         collect_token  = gen_random_uuid()
   where id = v_order.id;

  perform public.queue_order_messages(v_order.id);

  return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no,
                            'status', 'paid', 'already', false);
end $$;
revoke all on function public.confirm_cod_order(uuid) from public, anon;
grant execute on function public.confirm_cod_order(uuid) to authenticated;
