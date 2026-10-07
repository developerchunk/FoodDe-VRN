-- =============================================================================
-- 0024 — the rider says Picked up and Delivered; the guest is told both
--
-- The rider's pickup details now carry two buttons, Picked up and Delivered.
-- Their payloads are o:<order id>:p and o:<order id>:d. Only the rider the
-- order is assigned to may use them, checked by the WhatsApp number the tap
-- came from -- the same rule as Accept / Reject.
--
--   Picked up  -> the order is out_for_delivery
--   Delivered  -> the order is delivered (and was, by then, picked up)
--
-- Whenever an order reaches either status -- by the rider's tap or by an admin
-- on the Orders page -- the guest is sent a WhatsApp saying so, once.
-- =============================================================================

begin;

-- ----------------------------------------------- the guest hears, once each
create or replace function public.queue_guest_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'out_for_delivery' then
      perform public.queue_message(new.id, 'guest_out_for_delivery', 'guest', new.guest_phone,
                                   'guest_out_for_delivery:' || new.id || ':');
    elsif new.status = 'delivered' then
      perform public.queue_message(new.id, 'guest_delivered', 'guest', new.guest_phone,
                                   'guest_delivered:' || new.id || ':');
    end if;
  end if;
  return null;
end $$;
revoke all on function public.queue_guest_progress() from public, anon, authenticated;

drop trigger if exists orders_guest_progress on public.orders;
create trigger orders_guest_progress
  after update of status on public.orders
  for each row execute function public.queue_guest_progress();

-- ------------------------------------------------- the rider moves it along
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

-- ----------------------------------------------- a button reply, routed
--   k:<ticket id>:a|r   a kitchen's answer
--   d:<offer id>:a|r    a rider's answer to the offer
--   o:<order id>:p|d    the assigned rider: picked up / delivered
create or replace function public.whatsapp_button_reply(
  p_payload    text,
  p_from       text,
  p_inbound_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_payload, ''), ':');
  v_id    uuid;
begin
  if array_length(v_parts, 1) <> 3 or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('outcome', 'unknown');
  end if;
  v_id := v_parts[2]::uuid;

  if v_parts[1] = 'k' and v_parts[3] in ('a', 'r') then
    return public.kitchen_decide(v_id, v_parts[3] = 'a', 'kitchen', p_from, p_inbound_id);
  elsif v_parts[1] = 'd' and v_parts[3] in ('a', 'r') then
    return public.rider_decide(v_id, v_parts[3] = 'a', p_from, p_inbound_id);
  elsif v_parts[1] = 'o' and v_parts[3] in ('p', 'd') then
    return public.rider_progress(v_id, case v_parts[3] when 'p' then 'picked' else 'delivered' end,
                                 p_from, p_inbound_id);
  end if;
  return jsonb_build_object('outcome', 'unknown');
end $$;
revoke all on function public.whatsapp_button_reply(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('rider_progress', 'queue_guest_progress', 'whatsapp_button_reply')
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'a delivery-progress function is reachable from the browser';
  end if;
end $$;

commit;
