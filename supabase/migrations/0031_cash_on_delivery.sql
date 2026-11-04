-- =============================================================================
-- 0031 — cash on delivery
--
-- A guest may now choose to pay when the food arrives instead of before it is
-- cooked. The order then goes to the kitchens straight away, unpaid, and the
-- money is taken at the door:
--
--   * the guest is sent a link to pay online when the order goes out for
--     delivery (the guest_out_for_delivery message, written differently for an
--     unpaid cash-on-delivery order -- see fanout.ts);
--   * the rider is sent a link to /collect/<collect_token>, with two choices:
--       Online -> the guest pays there and then, which completes the order
--       Cash   -> the rider took cash, which records it and completes the order.
--
-- What "paid" means. Everything downstream of payment -- the fan-out, the
-- escalations, the admin board, analytics -- keys on paid_at and on status
-- 'paid'. A cash-on-delivery order has to flow through all of it exactly as a
-- paid one does, so confirming it sets both: status 'paid' and paid_at mean
-- "confirmed and sent to the kitchens". Whether the MONEY has arrived is a
-- separate question for these orders, answered by collected_at / collected_via.
--
--   payment_method 'online'  money in hand when paid_at is set (as before)
--   payment_method 'cod'     money in hand when collected_at is set
--
-- A cash-on-delivery order is not cancelled at the guest's request; an admin
-- can still cancel one the kitchens or riders cannot fulfil.
-- =============================================================================

begin;

-- ------------------------------------------------------------------ columns
alter table public.orders
  add column if not exists payment_method text not null default 'online',
  -- the rider's link; never the receipt token, which the guest holds
  add column if not exists collect_token  uuid,
  add column if not exists collected_at   timestamptz,
  add column if not exists collected_via  text;

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('online', 'cod'));
alter table public.orders drop constraint if exists orders_collected_via_check;
alter table public.orders add constraint orders_collected_via_check
  check (collected_via in ('online', 'cash'));

create unique index if not exists orders_collect_token_uniq
  on public.orders (collect_token) where collect_token is not null;

-- ------------------------------------------------- choosing cash on delivery
-- Called with the guest's own session (the order-cod edge function forwards
-- it), so only the guest who placed the order can confirm it. Nothing about the
-- bill changes: place_order priced it, and this only decides when it is paid.
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

-- ------------------------------------------------- paying a COD order online
-- 0019's, plus: a cash-on-delivery order not yet collected may be paid online,
-- whatever stage it has reached. Its dishes are already cooking, so whether
-- they are still on the menu no longer matters.
create or replace function public.attach_razorpay_order(
  p_token    uuid,
  p_rzp_id   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_gone  text;
begin
  select * into v_order from public.orders where receipt_token = p_token;
  if not found then
    raise exception 'no such order' using errcode = '22023';
  end if;

  if v_order.payment_method = 'cod' then
    if v_order.collected_at is not null or v_order.status in ('cancelled', 'failed') then
      raise exception 'that order is not awaiting payment' using errcode = '22023';
    end if;
  else
    if v_order.status <> 'pending_payment' then
      raise exception 'that order is not awaiting payment' using errcode = '22023';
    end if;
    v_gone := public.unavailable_in_order(v_order.id);
    if v_gone is not null then
      raise exception 'no longer available: %', v_gone using errcode = '22023';
    end if;
  end if;

  update public.orders
     set razorpay_order_id = p_rzp_id
   where id = v_order.id;

  return jsonb_build_object(
    'order_no',    v_order.order_no,
    'total_paise', v_order.total_paise,
    'guest_name',  v_order.guest_name,
    'guest_phone', v_order.guest_phone,
    'guest_email', v_order.guest_email
  );
end $$;

-- ---------------------------------------------------------------- marking paid
-- 0016's, plus the cash-on-delivery case: the order is already with the
-- kitchens, so a payment only records that the money arrived. It queues
-- nothing and moves no status; the rider completes the order.
create or replace function public.mark_order_paid(
  p_rzp_order_id text,
  p_payment_id   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
    from public.orders
   where razorpay_order_id = p_rzp_order_id
   for update;
  if not found then
    raise exception 'no order carries that razorpay order id' using errcode = '22023';
  end if;

  if v_order.payment_method = 'cod' then
    if v_order.collected_at is not null then
      -- The browser and the webhook both report it: whichever is second.
      if v_order.razorpay_payment_id is not distinct from p_payment_id then
        return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no,
                                  'status', v_order.status, 'already_paid', true);
      end if;
      -- Paid online after the rider took cash: the guest paid twice.
      update public.orders
         set razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
             needs_attention     = true,
             attention_note      = 'Paid online (' || p_payment_id || ') after the payment '
                                   || 'was already collected. Refund the online payment in Razorpay.'
       where id = v_order.id;
      return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no,
                                'status', v_order.status, 'already_paid', true);
    end if;

    update public.orders
       set razorpay_payment_id = p_payment_id,
           collected_at        = now(),
           collected_via       = 'online',
           -- money for an order nobody is bringing goes back
           needs_attention     = needs_attention or status in ('cancelled', 'failed'),
           attention_note      = case when status in ('cancelled', 'failed')
                                      then 'Paid online after it was cancelled. Refund it in Razorpay.'
                                      else attention_note end
     where id = v_order.id;

    return jsonb_build_object('order_id', v_order.id, 'order_no', v_order.order_no,
                              'status', v_order.status, 'already_paid', false);
  end if;

  -- Already done. Not an error: the webhook and the browser both report the
  -- same payment, and whichever arrives second must not fail.
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object(
      'order_id',     v_order.id,
      'order_no',     v_order.order_no,
      'status',       v_order.status,
      'already_paid', true
    );
  end if;

  update public.orders
     set status              = 'paid',
         razorpay_payment_id = p_payment_id,
         paid_at             = now()
   where id = v_order.id;

  perform public.queue_order_messages(v_order.id);

  return jsonb_build_object(
    'order_id',     v_order.id,
    'order_no',     v_order.order_no,
    'status',       'paid',
    'already_paid', false
  );
end $$;

revoke all on function public.mark_order_paid(text, text) from public, anon, authenticated;

-- ------------------------------------------------- the rider's collect page
-- What /collect/<token> shows. Holding the token is the authorisation, as the
-- receipt token is for the guest: it is sent only to the assigned rider.
create or replace function public.get_collect(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'order_no',      o.order_no,
    'status',        o.status,
    'total_paise',   o.total_paise,
    'place_name',    p.name,
    'room_number',   a.room_number,
    'guest_name',    split_part(o.guest_name, ' ', 1),
    'collected_via', o.collected_via,
    'collected_at',  o.collected_at,
    -- the guest's payment page, for the QR the rider shows
    'pay_token',     o.receipt_token
  )
  from public.orders o
  join public.addresses a on a.id = o.address_id
  join public.places    p on p.id = a.place_id
  where o.collect_token = p_token
    and o.payment_method = 'cod';
$$;
revoke all on function public.get_collect(uuid) from public;
grant execute on function public.get_collect(uuid) to anon, authenticated;

-- Online: the guest has paid (collected_via 'online'), so hand it over.
-- Cash:   the rider took the cash; record it and hand it over.
-- Either way the order is then delivered, which tells the guest.
create or replace function public.rider_collect(p_token uuid, p_method text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if p_method not in ('online', 'cash') then
    raise exception 'choose online or cash' using errcode = '22023';
  end if;

  select * into v_order from public.orders
   where collect_token = p_token and payment_method = 'cod'
   for update;
  if not found then
    raise exception 'no such order' using errcode = '22023';
  end if;

  if v_order.status in ('cancelled', 'failed', 'pending_payment') then
    return jsonb_build_object('outcome', 'closed', 'status', v_order.status);
  end if;

  if v_order.collected_at is null then
    if p_method = 'online' then
      return jsonb_build_object('outcome', 'not_paid', 'status', v_order.status);
    end if;
    update public.orders
       set collected_at = now(), collected_via = 'cash'
     where id = v_order.id;
  end if;

  if v_order.status <> 'delivered' then
    update public.orders set status = 'delivered' where id = v_order.id;
  end if;

  return jsonb_build_object(
    'outcome',       'delivered',
    'status',        'delivered',
    'collected_via', coalesce(v_order.collected_via, 'cash')
  );
end $$;
revoke all on function public.rider_collect(uuid, text) from public;
grant execute on function public.rider_collect(uuid, text) to anon, authenticated;

-- ------------------------------------------- out for delivery: the rider too
-- 0024's, plus: an unpaid cash-on-delivery order going out sends the rider
-- their collect link. The guest's own message is the same kind as ever;
-- fanout.ts writes it with the pay link when the order is still unpaid.
create or replace function public.queue_guest_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rider public.delivery_partners%rowtype;
begin
  if new.status is distinct from old.status then
    if new.status = 'out_for_delivery' then
      perform public.queue_message(new.id, 'guest_out_for_delivery', 'guest', new.guest_phone,
                                   'guest_out_for_delivery:' || new.id || ':');
      if new.payment_method = 'cod' and new.collected_at is null
         and new.delivery_partner_id is not null then
        select * into v_rider from public.delivery_partners where id = new.delivery_partner_id;
        perform public.queue_message(new.id, 'delivery_collect', 'delivery', v_rider.whatsapp_number,
                                     'delivery_collect:' || new.id || ':' || v_rider.id,
                                     null, v_rider.id);
      end if;
    elsif new.status = 'delivered' then
      perform public.queue_message(new.id, 'guest_delivered', 'guest', new.guest_phone,
                                   'guest_delivered:' || new.id || ':');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.queue_guest_progress() from public, anon, authenticated;

-- ------------------------------------------ Delivered, before the money: no
-- 0024's, except that a cash-on-delivery order is not marked delivered by the
-- WhatsApp button until its payment is recorded. The rider is pointed at the
-- collect link instead, which records the payment and delivers it in one go.
create or replace function public.rider_progress(
  p_order_id   uuid,
  p_step       text,        -- 'picked' or 'delivered'
  p_from       text,
  p_inbound_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_partner public.delivery_partners%rowtype;
  v_outcome text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('outcome', 'unknown');
  end if;

  select * into v_partner from public.delivery_partners where id = v_order.delivery_partner_id;

  -- Only the rider this order is assigned to. Anyone else who somehow holds
  -- the message is told it is not theirs, and nothing changes.
  if v_partner.id is null or not public.same_number(p_from, v_partner.whatsapp_number) then
    select * into v_partner from public.delivery_partners d
     where public.same_number(p_from, d.whatsapp_number) limit 1;
    if v_partner.id is not null and p_inbound_id is not null then
      perform public.queue_message(v_order.id, 'delivery_ack', 'delivery', v_partner.whatsapp_number,
                                   'reply:' || p_inbound_id, null, v_partner.id,
                                   jsonb_build_object('ack', 'not_yours'));
    end if;
    return jsonb_build_object('outcome', 'wrong_sender', 'order_id', v_order.id);
  end if;

  if v_order.status in ('pending_payment', 'cancelled', 'failed') then
    v_outcome := 'closed';
  elsif p_step = 'picked' then
    if v_order.status in ('out_for_delivery', 'delivered') then
      v_outcome := 'already_picked';
    else
      update public.orders set status = 'out_for_delivery' where id = v_order.id;
      v_outcome := 'picked_up';
    end if;
  elsif p_step = 'delivered' then
    if v_order.status = 'delivered' then
      v_outcome := 'already_delivered';
    elsif v_order.payment_method = 'cod' and v_order.collected_at is null then
      v_outcome := 'collect_first';
    else
      update public.orders set status = 'delivered' where id = v_order.id;
      v_outcome := 'delivered';
    end if;
  else
    return jsonb_build_object('outcome', 'unknown');
  end if;

  if p_inbound_id is not null then
    perform public.queue_message(v_order.id, 'delivery_ack', 'delivery', v_partner.whatsapp_number,
                                 'reply:' || p_inbound_id, null, v_partner.id,
                                 jsonb_build_object('ack', v_outcome));
  end if;

  return jsonb_build_object('outcome', v_outcome, 'order_id', v_order.id);
end $$;
revoke all on function public.rider_progress(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the receipt
-- 0017's, plus how it is being paid and whether the money is in.
create or replace function public.get_receipt(p_token uuid)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
    'place_name', p.name, 'room_number', a.room_number,
    'guest_name', o.guest_name, 'guest_phone', o.guest_phone,
    'note', o.note,
    'payment_method', o.payment_method,
    'collected_via',  o.collected_via,
    'is_paid',        case when o.payment_method = 'cod' then o.collected_at is not null
                           else o.paid_at is not null end,
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
  join public.places    p on p.id = a.place_id
  where o.receipt_token = p_token;
$$;

revoke all on function public.get_receipt(uuid) from public;
grant execute on function public.get_receipt(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('mark_order_paid', 'attach_razorpay_order', 'rider_progress',
                            'queue_guest_progress')
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'a payment or delivery function is reachable from the browser';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'confirm_cod_order' and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'confirm_cod_order is reachable without a session';
  end if;
  raise notice 'cash on delivery: functions in place, payment functions still private';
end $$;

commit;
