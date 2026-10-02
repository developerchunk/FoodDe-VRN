-- =============================================================================
-- 0019 — kitchens and riders accept or reject, on WhatsApp
--
-- 0016 told everyone about a paid order at once and assumed it would happen.
-- Now each step waits for an answer:
--
--   paid ──► every kitchen on the order gets its dishes, with Accept / Reject
--            (the rest house and the guest are told the order is placed)
--
--   a kitchen rejects ──► the admin's WhatsApp gets the order, which kitchen
--            rejected, and where every kitchen on the order stands. The order is
--            NOT cancelled: the other kitchens carry on, and the admin decides.
--
--   every kitchen has answered, at least one accepted
--        ──► every active delivery partner gets the pickup, with Accept / Reject.
--            Only the kitchens that accepted are on the pickup list.
--        ──► if none rejected, the order becomes `preparing` and the guest is
--            told it was accepted.
--
--   the first rider to accept gets it: they receive the full pickup details,
--            and every rider still deciding is told it has been taken. A rider
--            who accepts a moment too late is told so.
--
--   nobody answers ──► after 10 minutes, a kitchen that has not answered, or an
--            order no rider has taken, is sent to the admin's WhatsApp.
--
-- The answers arrive on whatsapp-webhook as button replies. The decisions live
-- here, in single transactions that lock the order, so two riders tapping
-- Accept in the same second cannot both get it.
--
-- Every message is still a message_log row before it is a request. The row now
-- carries `kind` (which message) and `dedupe_key` (what makes it unique), so
-- one recipient can receive several different messages about one order.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- the columns
alter table public.order_tickets
  add column if not exists rejected_at  timestamptz,
  add column if not exists responded_by text check (responded_by in ('kitchen', 'admin')),
  add column if not exists escalated_at timestamptz;

alter table public.orders
  add column if not exists delivery_partner_id text references public.delivery_partners (id),
  add column if not exists rider_assigned_at   timestamptz,
  add column if not exists riders_offered_at   timestamptz,
  add column if not exists needs_attention     boolean not null default false,
  add column if not exists attention_note      text;

create index if not exists orders_created_idx  on public.orders (created_at);
create index if not exists orders_attention_idx on public.orders (needs_attention) where needs_attention;

-- One row per rider per order: who was asked, and what they said.
create table if not exists public.delivery_offers (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  delivery_partner_id  text not null references public.delivery_partners (id),
  -- offered: waiting · accepted: got it · declined: said no
  -- taken: someone else got it first · late: said yes after someone else did
  status               text not null default 'offered'
                       check (status in ('offered', 'accepted', 'declined', 'taken', 'late')),
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  unique (order_id, delivery_partner_id)
);
create index if not exists delivery_offers_order_idx on public.delivery_offers (order_id);

alter table public.delivery_offers enable row level security;
revoke all on public.delivery_offers from anon, authenticated;
grant select on public.delivery_offers to authenticated;
drop policy if exists delivery_offers_staff_read on public.delivery_offers;
create policy delivery_offers_staff_read on public.delivery_offers
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_super_admin()));

-- Every status an order passes through, and when. Analytics measure time to
-- accept and time to deliver from this; nothing else records when "delivered"
-- happened.
create table if not exists public.order_status_history (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references public.orders (id) on delete cascade,
  status    public.order_status not null,
  at        timestamptz not null default now()
);
create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, at);

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from anon, authenticated;
grant select on public.order_status_history to authenticated;
drop policy if exists order_status_history_staff_read on public.order_status_history;
create policy order_status_history_staff_read on public.order_status_history
  for select to authenticated
  using ((select public.is_admin()) or (select public.is_super_admin()));

create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status) values (new.id, new.status);
  end if;
  return null;
end $$;
revoke all on function public.log_order_status() from public, anon, authenticated;

drop trigger if exists orders_status_history on public.orders;
create trigger orders_status_history
  after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- Orders that existed before this migration: their history starts with what
-- is known, so analytics do not treat them as never paid.
insert into public.order_status_history (order_id, status, at)
select o.id, 'pending_payment', o.created_at from public.orders o
 where not exists (select 1 from public.order_status_history h where h.order_id = o.id);
insert into public.order_status_history (order_id, status, at)
select o.id, 'paid', o.paid_at from public.orders o
 where o.paid_at is not null
   and not exists (select 1 from public.order_status_history h
                    where h.order_id = o.id and h.status = 'paid');

-- ---------------------------------------------------------------- message_log
alter table public.message_log
  drop constraint if exists message_log_recipient_type_check;
alter table public.message_log
  add constraint message_log_recipient_type_check
  check (recipient_type in ('kitchen', 'delivery', 'property', 'guest', 'admin'));

alter table public.message_log
  add column if not exists kind                text,
  add column if not exists dedupe_key          text,
  add column if not exists delivery_partner_id text references public.delivery_partners (id),
  -- what the message must say that the order alone does not: which decision
  -- is being acknowledged, why the admin is being alerted
  add column if not exists context             jsonb not null default '{}'::jsonb;

-- Rows queued by 0016 predate `kind`; they map one-to-one from the recipient.
update public.message_log
   set kind = case recipient_type
                when 'kitchen'  then 'kitchen_order'
                when 'delivery' then 'delivery_details'
                when 'property' then 'property_order'
                when 'guest'    then 'guest_confirmation'
              end
 where kind is null;
update public.message_log
   set dedupe_key = kind || ':' || order_id || ':' || coalesce(kitchen_id, '')
 where dedupe_key is null;

alter table public.message_log alter column kind set not null;
alter table public.message_log alter column dedupe_key set not null;

drop index if exists public.message_log_one_per_recipient;
create unique index if not exists message_log_dedupe_uniq on public.message_log (dedupe_key);

-- Queues one message. Repeating it is harmless: the dedupe key decides whether
-- this exact message already exists, so a webhook Meta delivers twice, or a
-- payment both the browser and Razorpay report, produces it once.
create or replace function public.queue_message(
  p_order_id       uuid,
  p_kind           text,
  p_recipient_type text,
  p_number         text,
  p_dedupe_key     text,
  p_kitchen_id     text default null,
  p_partner_id     text default null,
  p_context        jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.message_log
    (order_id, kind, recipient_type, recipient_number, dedupe_key,
     kitchen_id, delivery_partner_id, context, status, error)
  values
    (p_order_id, p_kind, p_recipient_type, coalesce(p_number, ''), p_dedupe_key,
     p_kitchen_id, p_partner_id, coalesce(p_context, '{}'::jsonb),
     -- no number is still a row, as failed, so the gap is visible
     case when coalesce(p_number, '') = '' then 'failed' else 'queued' end,
     case when coalesce(p_number, '') = '' then 'no number on file' end)
  on conflict (dedupe_key) do nothing;
$$;

create or replace function public.admin_number()
returns text language sql stable security definer set search_path = public as $$
  select value from public.settings where key = 'admin_whatsapp'
$$;

-- The same person, however the number is written: 9876543210, +91 98765 43210
-- and Meta's 919876543210 all compare equal.
create or replace function public.same_number(a text, b text)
returns boolean language sql immutable as $$
  select right(regexp_replace(coalesce(a, ''), '\D', '', 'g'), 10) <> ''
     and right(regexp_replace(coalesce(a, ''), '\D', '', 'g'), 10)
       = right(regexp_replace(coalesce(b, ''), '\D', '', 'g'), 10)
$$;

-- ------------------------------------------------------------ on payment
-- Replaces 0016's: the kitchens, the rest house and the guest. Not the riders
-- any more -- they are asked once the kitchens have answered.
create or replace function public.queue_order_messages(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before int;
begin
  select count(*) into v_before from public.message_log where order_id = p_order_id;

  perform public.queue_message(t.order_id, 'kitchen_order', 'kitchen', k.whatsapp_number,
                               'kitchen_order:' || t.order_id || ':' || k.id, k.id)
     from public.order_tickets t
     join public.kitchens k on k.id = t.kitchen_id
    where t.order_id = p_order_id;

  perform public.queue_message(o.id, 'property_order', 'property', p.whatsapp_number,
                               'property_order:' || o.id || ':')
     from public.orders o
     join public.addresses a on a.id = o.address_id
     join public.places    p on p.id = a.place_id
    where o.id = p_order_id;

  perform public.queue_message(o.id, 'guest_confirmation', 'guest', o.guest_phone,
                               'guest_confirmation:' || o.id || ':')
     from public.orders o
    where o.id = p_order_id;

  return (select count(*) from public.message_log where order_id = p_order_id) - v_before;
end $$;

-- ------------------------------------------------------- Meta's answer, kept
-- As 0016's, except that only the order message itself moves a ticket on --
-- the acknowledgements a kitchen now also receives must not.
create or replace function public.record_message_result(
  p_id           uuid,
  p_provider_id  text,
  p_payload      jsonb,
  p_error        text,
  p_retry        boolean,
  p_max_attempts int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.message_log%rowtype;
begin
  if p_provider_id is not null then
    update public.message_log
       set status              = 'accepted',
           provider_message_id = p_provider_id,
           payload             = p_payload,
           error               = null,
           accepted_at         = now()
     where id = p_id
       and status = 'sending'
    returning * into v_row;
    if not found then return; end if;

    if v_row.kind = 'kitchen_order' then
      update public.order_tickets
         set status = 'sent'
       where order_id = v_row.order_id
         and kitchen_id = v_row.kitchen_id
         and status = 'pending';

      update public.orders o
         set status = 'sent_to_kitchen'
       where o.id = v_row.order_id
         and o.status = 'paid'
         and not exists (
           select 1 from public.message_log m
            where m.order_id = o.id
              and m.kind = 'kitchen_order'
              and m.provider_message_id is null
         );
    end if;
  else
    update public.message_log
       set status  = case when p_retry and attempts < p_max_attempts
                          then 'retry' else 'failed' end,
           payload = p_payload,
           error   = p_error
     where id = p_id
       and status = 'sending';
  end if;
end $$;

-- --------------------------------------------------------- moving it along
-- Called after every kitchen decision. Does nothing until every kitchen on the
-- order has answered; then asks the riders, and tells the guest if nothing
-- was rejected.
create or replace function public.advance_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders%rowtype;
  v_waiting  int;
  v_accepted int;
  v_rejected int;
  v_partners int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status not in ('paid', 'sent_to_kitchen', 'preparing') then
    return;
  end if;

  select count(*) filter (where status not in ('accepted', 'rejected')),
         count(*) filter (where status = 'accepted'),
         count(*) filter (where status = 'rejected')
    into v_waiting, v_accepted, v_rejected
    from public.order_tickets
   where order_id = p_order_id;

  if v_waiting > 0 then return; end if;

  -- Nothing was rejected: the guest's order is accepted, as a whole.
  if v_rejected = 0 and v_order.status in ('paid', 'sent_to_kitchen') then
    update public.orders set status = 'preparing' where id = p_order_id;
    perform public.queue_message(v_order.id, 'guest_accepted', 'guest', v_order.guest_phone,
                                 'guest_accepted:' || v_order.id || ':');
  end if;

  -- Something to collect, and the riders not yet asked.
  if v_accepted > 0 and v_order.riders_offered_at is null
     and v_order.delivery_partner_id is null then
    update public.orders set riders_offered_at = now() where id = p_order_id;

    insert into public.delivery_offers (order_id, delivery_partner_id)
    select p_order_id, d.id
      from public.delivery_partners d
     where d.is_active
    on conflict (order_id, delivery_partner_id) do nothing;
    get diagnostics v_partners = row_count;

    perform public.queue_message(p_order_id, 'delivery_offer', 'delivery', d.whatsapp_number,
                                 'delivery_offer:' || f.id, null, d.id,
                                 jsonb_build_object('offer_id', f.id))
       from public.delivery_offers f
       join public.delivery_partners d on d.id = f.delivery_partner_id
      where f.order_id = p_order_id
        and f.status = 'offered';

    if v_partners = 0 then
      update public.orders
         set needs_attention = true,
             attention_note  = coalesce(attention_note, 'No active delivery partner to ask')
       where id = p_order_id;
      perform public.queue_message(p_order_id, 'admin_alert', 'admin', public.admin_number(),
                                   'admin_alert:no_rider:' || p_order_id, null, null,
                                   jsonb_build_object('reason', 'no_partners'));
    end if;
  end if;
end $$;

-- ------------------------------------------------------- a kitchen answers
-- p_from is the WhatsApp number the button reply came from; it must be the
-- kitchen's own. Null when an admin records the answer on the kitchen's behalf
-- (after a phone call), and then there is nobody to acknowledge.
create or replace function public.kitchen_decide(
  p_ticket_id  uuid,
  p_accept     boolean,
  p_actor      text,
  p_from       text default null,
  p_inbound_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket   public.order_tickets%rowtype;
  v_order    public.orders%rowtype;
  v_kitchen  public.kitchens%rowtype;
  v_decision text := case when p_accept then 'accepted' else 'rejected' end;
  v_ack      text;
begin
  select * into v_ticket from public.order_tickets where id = p_ticket_id;
  if not found then
    return jsonb_build_object('outcome', 'unknown');
  end if;

  -- Order first, then ticket: the same lock order as advance_order, so two
  -- kitchens answering at once queue up instead of deadlocking.
  select * into v_order from public.orders where id = v_ticket.order_id for update;
  select * into v_ticket from public.order_tickets where id = p_ticket_id for update;
  select * into v_kitchen from public.kitchens where id = v_ticket.kitchen_id;

  if p_from is not null and not public.same_number(p_from, v_kitchen.whatsapp_number) then
    return jsonb_build_object('outcome', 'wrong_sender', 'order_id', v_order.id);
  end if;

  if v_order.status not in ('paid', 'sent_to_kitchen', 'preparing') then
    v_ack := 'closed';
  elsif v_ticket.status in ('accepted', 'rejected') then
    v_ack := 'already';
    v_decision := v_ticket.status;
  else
    update public.order_tickets
       set status       = v_decision,
           accepted_at  = case when p_accept then now() end,
           rejected_at  = case when p_accept then null else now() end,
           responded_by = p_actor
     where id = p_ticket_id;
    v_ack := v_decision;

    if not p_accept then
      update public.orders
         set needs_attention = true,
             attention_note  = coalesce(attention_note, v_kitchen.place_name || ' rejected')
       where id = v_order.id;
      perform public.queue_message(v_order.id, 'admin_alert', 'admin', public.admin_number(),
                                   'admin_alert:kitchen_rejected:' || v_order.id || ':' || v_kitchen.id,
                                   v_kitchen.id, null,
                                   jsonb_build_object('reason', 'kitchen_rejected'));
    end if;
  end if;

  if p_inbound_id is not null then
    perform public.queue_message(v_order.id, 'kitchen_ack', 'kitchen', v_kitchen.whatsapp_number,
                                 'reply:' || p_inbound_id, v_kitchen.id, null,
                                 jsonb_build_object('ack', v_ack, 'decision', v_decision));
  end if;

  if v_ack in ('accepted', 'rejected') then
    perform public.advance_order(v_order.id);
  end if;

  return jsonb_build_object('outcome', v_ack, 'order_id', v_order.id);
end $$;

-- --------------------------------------------------------- a rider answers
create or replace function public.rider_decide(
  p_offer_id   uuid,
  p_accept     boolean,
  p_from       text default null,
  p_inbound_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer   public.delivery_offers%rowtype;
  v_order   public.orders%rowtype;
  v_partner public.delivery_partners%rowtype;
  v_outcome text;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id;
  if not found then
    return jsonb_build_object('outcome', 'unknown');
  end if;

  -- The order row is the lock. Every rider's answer for one order passes
  -- through it one at a time, which is what makes "first to accept" true.
  select * into v_order from public.orders where id = v_offer.order_id for update;
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;
  select * into v_partner from public.delivery_partners where id = v_offer.delivery_partner_id;

  if p_from is not null and not public.same_number(p_from, v_partner.whatsapp_number) then
    return jsonb_build_object('outcome', 'wrong_sender', 'order_id', v_order.id);
  end if;

  if v_order.status in ('pending_payment', 'cancelled', 'failed', 'delivered') then
    v_outcome := 'closed';
  elsif v_offer.status <> 'offered' then
    -- answered already, or overtaken; say where it stands
    v_outcome := case v_offer.status
                   when 'accepted' then 'already_yours'
                   when 'declined' then 'already_declined'
                   else 'late' end;
  elsif not p_accept then
    update public.delivery_offers
       set status = 'declined', responded_at = now()
     where id = p_offer_id;
    v_outcome := 'declined';

    -- The last rider still deciding just said no, and nobody has it.
    if v_order.delivery_partner_id is null and not exists (
      select 1 from public.delivery_offers
       where order_id = v_order.id and status = 'offered'
    ) then
      update public.orders
         set needs_attention = true,
             attention_note  = coalesce(attention_note, 'Every delivery partner declined')
       where id = v_order.id;
      perform public.queue_message(v_order.id, 'admin_alert', 'admin', public.admin_number(),
                                   'admin_alert:no_rider:' || v_order.id, null, null,
                                   jsonb_build_object('reason', 'all_declined'));
    end if;
  elsif v_order.delivery_partner_id is not null then
    update public.delivery_offers
       set status = 'late', responded_at = now()
     where id = p_offer_id;
    v_outcome := 'late';
  else
    update public.orders
       set delivery_partner_id = v_partner.id,
           rider_assigned_at   = now()
     where id = v_order.id;
    update public.delivery_offers
       set status = 'accepted', responded_at = now()
     where id = p_offer_id;
    perform public.queue_message(v_order.id, 'delivery_details', 'delivery', v_partner.whatsapp_number,
                                 'delivery_details:' || v_order.id || ':' || v_partner.id,
                                 null, v_partner.id);
    perform public.tell_riders_taken(v_order.id);
    v_outcome := 'assigned';
  end if;

  -- The rider who got it is answered by the pickup details themselves.
  if p_inbound_id is not null and v_outcome <> 'assigned' then
    perform public.queue_message(v_order.id, 'delivery_ack', 'delivery', v_partner.whatsapp_number,
                                 'reply:' || p_inbound_id, null, v_partner.id,
                                 jsonb_build_object('ack', v_outcome));
  end if;

  return jsonb_build_object('outcome', v_outcome, 'order_id', v_order.id);
end $$;

-- Everyone still deciding is told it has gone, so nobody sets off for it.
create or replace function public.tell_riders_taken(p_order_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  with gone as (
    update public.delivery_offers
       set status = 'taken'
     where order_id = p_order_id
       and status = 'offered'
    returning id, delivery_partner_id
  )
  select public.queue_message(p_order_id, 'delivery_taken', 'delivery', d.whatsapp_number,
                              'delivery_taken:' || g.id, null, d.id)
    from gone g
    join public.delivery_partners d on d.id = g.delivery_partner_id;
$$;

-- ----------------------------------------------------- a button reply, routed
-- The payload is what we put on the button when we sent it:
--   k:<ticket id>:a   k:<ticket id>:r     a kitchen's answer
--   d:<offer id>:a    d:<offer id>:r      a rider's answer
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
  if array_length(v_parts, 1) <> 3 or v_parts[3] not in ('a', 'r')
     or v_parts[2] !~ '^[0-9a-f-]{36}$' then
    return jsonb_build_object('outcome', 'unknown');
  end if;
  v_id := v_parts[2]::uuid;

  if v_parts[1] = 'k' then
    return public.kitchen_decide(v_id, v_parts[3] = 'a', 'kitchen', p_from, p_inbound_id);
  elsif v_parts[1] = 'd' then
    return public.rider_decide(v_id, v_parts[3] = 'a', p_from, p_inbound_id);
  end if;
  return jsonb_build_object('outcome', 'unknown');
end $$;

-- ---------------------------------------------------------- nobody answered
-- Run by the dispatch sweep every minute. A kitchen silent for p_minutes after
-- the order was paid, or an order no rider has taken p_minutes after riders
-- were asked, goes to the admin. Once each: the dedupe key sees to that.
create or replace function public.escalate_overdue(p_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int := 0;
  r   record;
begin
  for r in
    select t.id, t.order_id, t.kitchen_id, k.place_name
      from public.order_tickets t
      join public.orders   o on o.id = t.order_id
      join public.kitchens k on k.id = t.kitchen_id
     where t.status in ('pending', 'sent')
       and t.escalated_at is null
       and o.status in ('paid', 'sent_to_kitchen')
       and o.paid_at < now() - make_interval(mins => p_minutes)
  loop
    update public.order_tickets set escalated_at = now() where id = r.id;
    update public.orders
       set needs_attention = true,
           attention_note  = coalesce(attention_note, r.place_name || ' has not answered')
     where id = r.order_id;
    perform public.queue_message(r.order_id, 'admin_alert', 'admin', public.admin_number(),
                                 'admin_alert:kitchen_silent:' || r.order_id || ':' || r.kitchen_id,
                                 r.kitchen_id, null,
                                 jsonb_build_object('reason', 'kitchen_silent', 'minutes', p_minutes));
    v_n := v_n + 1;
  end loop;

  for r in
    select o.id
      from public.orders o
     where o.delivery_partner_id is null
       and o.riders_offered_at < now() - make_interval(mins => p_minutes)
       and o.status in ('paid', 'sent_to_kitchen', 'preparing')
       and not exists (select 1 from public.message_log m
                        where m.dedupe_key = 'admin_alert:no_rider:' || o.id)
  loop
    update public.orders
       set needs_attention = true,
           attention_note  = coalesce(attention_note, 'No delivery partner has accepted')
     where id = r.id;
    perform public.queue_message(r.id, 'admin_alert', 'admin', public.admin_number(),
                                 'admin_alert:no_rider:' || r.id, null, null,
                                 jsonb_build_object('reason', 'no_rider', 'minutes', p_minutes));
    v_n := v_n + 1;
  end loop;

  return v_n;
end $$;

-- ------------------------------------------------ what the admin can do
-- Each returns the order id, so the admin page can ask for the resulting
-- messages to be sent straight away rather than at the next sweep.

-- A kitchen answered by phone instead of by button.
create or replace function public.admin_ticket_decision(p_ticket_id uuid, p_accept boolean)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return public.kitchen_decide(p_ticket_id, p_accept, 'admin');
end $$;

-- Give the delivery to a particular rider: one the admin rang, or a
-- replacement for one who cannot make it. They get the pickup details; anyone
-- still deciding is told it is taken.
create or replace function public.admin_assign_rider(p_order_id uuid, p_partner_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order   public.orders%rowtype;
  v_partner public.delivery_partners%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '22023';
  end if;
  if v_order.status in ('pending_payment', 'cancelled', 'failed', 'delivered') then
    raise exception 'that order is not open' using errcode = '22023';
  end if;

  select * into v_partner from public.delivery_partners where id = p_partner_id;
  if not found then
    raise exception 'no such delivery partner' using errcode = '22023';
  end if;

  update public.orders
     set delivery_partner_id = v_partner.id,
         rider_assigned_at   = now(),
         riders_offered_at   = coalesce(riders_offered_at, now())
   where id = p_order_id;

  update public.delivery_offers
     set status = 'accepted', responded_at = coalesce(responded_at, now())
   where order_id = p_order_id and delivery_partner_id = v_partner.id;
  -- whoever held it before is no longer the rider
  update public.delivery_offers
     set status = 'taken'
   where order_id = p_order_id and delivery_partner_id <> v_partner.id
     and status = 'accepted';

  perform public.queue_message(p_order_id, 'delivery_details', 'delivery', v_partner.whatsapp_number,
                               'delivery_details:' || p_order_id || ':' || v_partner.id,
                               null, v_partner.id);
  perform public.tell_riders_taken(p_order_id);

  return jsonb_build_object('order_id', p_order_id);
end $$;

-- Moving the order along by hand: the kitchen is cooking, the rider has
-- left, it arrived -- or it is cancelled. A cancellation does not refund: that
-- is done in Razorpay, and the page says so.
create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_status   public.order_status
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_status not in ('preparing', 'out_for_delivery', 'delivered', 'cancelled') then
    raise exception 'an admin cannot set an order to %', p_status using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '22023';
  end if;
  if v_order.status in ('pending_payment', 'failed') then
    raise exception 'that order was never paid' using errcode = '22023';
  end if;
  if v_order.status in ('delivered', 'cancelled') and p_status <> v_order.status then
    raise exception 'that order is already %', v_order.status using errcode = '22023';
  end if;

  update public.orders set status = p_status where id = p_order_id;

  -- Closed: nobody still deciding should set off for it.
  if p_status = 'cancelled' then
    perform public.tell_riders_taken(p_order_id);
  end if;

  return jsonb_build_object('order_id', p_order_id, 'status', p_status);
end $$;

create or replace function public.admin_resolve_attention(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.orders
     set needs_attention = false, attention_note = null
   where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id);
end $$;

-- Puts a failed message back in the queue. Only a failed one: anything else is
-- either on its way or already there.
create or replace function public.admin_retry_message(p_message_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order uuid;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  update public.message_log
     set status = 'queued', attempts = 0, error = null, claimed_at = null
   where id = p_message_id
     and status = 'failed'
     and recipient_number <> ''
  returning order_id into v_order;
  if v_order is null then
    raise exception 'only a failed message with a number can be retried' using errcode = '22023';
  end if;
  return jsonb_build_object('order_id', v_order);
end $$;

-- ------------------------------------------ the guest's money, checked again
-- A dish switched off between placing the order and paying for it must not be
-- paid for. Called before Razorpay is asked for an order, and again when it is
-- attached; returns the names of whatever is no longer orderable, or null.
create or replace function public.unavailable_in_order(p_order_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select string_agg(i.name_snapshot, ', ' order by i.name_snapshot)
    from public.order_items i
    left join public.menu_items m on m.id = i.menu_item_id
    left join public.kitchens   k on k.id = m.kitchen_id
    left join public.meal_windows w on w.slot = m.meal_time
   where i.order_id = p_order_id
     and not coalesce(
           m.is_available and k.is_active
           and public.dish_is_on(m.meal_time,
                                 coalesce(m.meal_starts_at, w.starts_at),
                                 coalesce(m.meal_ends_at,   w.ends_at),
                                 k.opens_at, k.closes_at, k.is_sunday_off),
           false);
$$;

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
  if v_order.status <> 'pending_payment' then
    raise exception 'that order is not awaiting payment' using errcode = '22023';
  end if;

  v_gone := public.unavailable_in_order(v_order.id);
  if v_gone is not null then
    raise exception 'no longer available: %', v_gone using errcode = '22023';
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

-- ------------------------------------------------------------------ privileges
-- Nothing here is for a guest. The internal functions are for the edge
-- functions (secret key) alone; the admin_ ones check is_admin() themselves
-- and are callable by signed-in users so that check can run.
revoke all on function public.queue_message(uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_number()                         from public, anon, authenticated;
revoke all on function public.same_number(text, text)                from public, anon, authenticated;
revoke all on function public.queue_order_messages(uuid)             from public, anon, authenticated;
revoke all on function public.record_message_result(uuid, text, jsonb, text, boolean, int)
  from public, anon, authenticated;
revoke all on function public.advance_order(uuid)                    from public, anon, authenticated;
revoke all on function public.kitchen_decide(uuid, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.rider_decide(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.tell_riders_taken(uuid)                from public, anon, authenticated;
revoke all on function public.whatsapp_button_reply(text, text, text) from public, anon, authenticated;
revoke all on function public.escalate_overdue(int)                  from public, anon, authenticated;
revoke all on function public.unavailable_in_order(uuid)             from public, anon, authenticated;
revoke all on function public.attach_razorpay_order(uuid, text)      from public, anon, authenticated;

revoke all on function public.admin_ticket_decision(uuid, boolean)       from public, anon;
revoke all on function public.admin_assign_rider(uuid, text)             from public, anon;
revoke all on function public.admin_set_order_status(uuid, public.order_status) from public, anon;
revoke all on function public.admin_resolve_attention(uuid)              from public, anon;
revoke all on function public.admin_retry_message(uuid)                  from public, anon;
grant execute on function public.admin_ticket_decision(uuid, boolean)       to authenticated;
grant execute on function public.admin_assign_rider(uuid, text)             to authenticated;
grant execute on function public.admin_set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.admin_resolve_attention(uuid)              to authenticated;
grant execute on function public.admin_retry_message(uuid)                  to authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('queue_message', 'queue_order_messages', 'record_message_result',
                            'advance_order', 'kitchen_decide', 'rider_decide',
                            'tell_riders_taken', 'whatsapp_button_reply',
                            'escalate_overdue', 'unavailable_in_order',
                            'attach_razorpay_order', 'admin_number', 'same_number')
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'an order-flow function is reachable from the browser';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name like 'admin\_%' escape '\'
       and routine_name not in ('admin_roles', 'admin_whoami', 'admin_number')
       and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'an admin action is callable without signing in';
  end if;
end $$;

commit;
