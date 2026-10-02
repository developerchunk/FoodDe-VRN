-- =============================================================================
-- The WhatsApp fan-out: who gets told about a paid order, and a record of
-- whether each of them actually was.
--
-- The rule this is built around: if a message silently fails, nobody cooks the
-- food. So every message is a row before it is a request. The row is written in
-- the same transaction that marks the order paid, which means a paid order can
-- never exist without its messages queued, however the sending side falls over.
--
-- Sending happens in the edge functions (supabase/functions/_shared/fanout.ts).
-- The database only decides WHO: one row per kitchen on the order, one for the
-- delivery partner, one for the rest house, one for the guest.
--
-- Row lifecycle (message_log.status):
--   queued    written when the order was marked paid
--   sending   claimed by a dispatcher; reclaimed if it sits here 5 minutes
--   retry     Meta refused for a reason that may pass (rate limit, outage)
--   accepted  Meta took it and gave an id; the webhook moves it on from here
--   sent / delivered / read / failed   as reported by the webhook
--   failed    also: refused for good, out of attempts, or no number to send to
-- =============================================================================

-- A guest confirmation joins the three business messages: the site tells the
-- guest it has been sent, so it has to be.
alter table public.message_log
  drop constraint if exists message_log_recipient_type_check;
alter table public.message_log
  add constraint message_log_recipient_type_check
  check (recipient_type in ('kitchen', 'delivery', 'property', 'guest'));

alter table public.message_log
  add column if not exists kitchen_id  text references public.kitchens (id),
  add column if not exists claimed_at  timestamptz,
  add column if not exists accepted_at timestamptz;

-- One message per recipient per order. This is what makes queueing safe to
-- repeat: the browser's return and Razorpay's webhook both report the same
-- payment, and only the first may produce messages.
create unique index if not exists message_log_one_per_recipient
  on public.message_log (order_id, recipient_type, (coalesce(kitchen_id, '')));

-- ------------------------------------------------------------------- queueing
create or replace function public.queue_order_messages(p_order_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_n     int;
begin
  -- Each kitchen on the order: the items it must cook.
  insert into public.message_log (order_id, recipient_type, recipient_number, kitchen_id)
  select t.order_id, 'kitchen', k.whatsapp_number, k.id
    from public.order_tickets t
    join public.kitchens k on k.id = t.kitchen_id
   where t.order_id = p_order_id
  on conflict (order_id, recipient_type, (coalesce(kitchen_id, ''))) do nothing;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- The delivery partner. With none on file the row is still written, as
  -- failed, so the gap shows up in the log instead of nowhere.
  insert into public.message_log (order_id, recipient_type, recipient_number, status, error)
  select p_order_id, 'delivery', coalesce(d.whatsapp_number, ''),
         case when d.id is null then 'failed' else 'queued' end,
         case when d.id is null then 'no active delivery partner' end
    from (select 1) as one
    left join lateral (
      select id, whatsapp_number
        from public.delivery_partners
       where is_active
       order by created_at
       limit 1
    ) d on true
  on conflict (order_id, recipient_type, (coalesce(kitchen_id, ''))) do nothing;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  -- The rest house, and the guest.
  insert into public.message_log (order_id, recipient_type, recipient_number, status, error)
  select o.id, r.kind, coalesce(r.number, ''),
         case when coalesce(r.number, '') = '' then 'failed' else 'queued' end,
         case when coalesce(r.number, '') = '' then 'no number on file' end
    from public.orders o
    join public.addresses a on a.id = o.address_id
    cross join lateral (
      values ('property', a.phone_number),
             ('guest',    o.guest_phone)
    ) as r (kind, number)
   where o.id = p_order_id
  on conflict (order_id, recipient_type, (coalesce(kitchen_id, ''))) do nothing;
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  return v_total;
end $$;

-- ---------------------------------------------------------------- marking paid
-- Unchanged, except that the transition to paid now queues the fan-out in the
-- same transaction, and the order's id comes back so the caller can dispatch.
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
   where razorpay_order_id = p_rzp_order_id;
  if not found then
    raise exception 'no order carries that razorpay order id' using errcode = '22023';
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

-- -------------------------------------------------------------------- claiming
-- Hands a dispatcher the rows it should send now, and marks them so a second
-- dispatcher running at the same moment gets different ones (skip locked).
-- p_order_id null sweeps every order: that is the retry pass.
create or replace function public.claim_messages(
  p_order_id     uuid,
  p_max_attempts int
) returns setof public.message_log
language sql
security definer
set search_path = public
as $$
  update public.message_log m
     set status     = 'sending',
         claimed_at = now(),
         attempts   = m.attempts + 1
   where m.id in (
     select id
       from public.message_log
      where (p_order_id is null or order_id = p_order_id)
        and attempts < p_max_attempts
        and (
          status in ('queued', 'retry')
          -- a dispatcher that died mid-send leaves rows here; take them back
          or (status = 'sending' and claimed_at < now() - interval '5 minutes')
        )
      order by created_at
      for update skip locked
      limit 50
   )
  returning m.*;
$$;

-- ------------------------------------------------------------------- recording
-- What Meta said about one send. An accepted kitchen message also moves its
-- ticket on, and once every kitchen has its ticket the order is sent_to_kitchen.
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

    if v_row.recipient_type = 'kitchen' then
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
              and m.recipient_type = 'kitchen'
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

-- None of this is for the browser. Only the edge functions, holding the secret
-- key, may queue, claim or record a message.
revoke all on function public.queue_order_messages(uuid)                     from public, anon, authenticated;
revoke all on function public.mark_order_paid(text, text)                    from public, anon, authenticated;
revoke all on function public.claim_messages(uuid, int)                      from public, anon, authenticated;
revoke all on function public.record_message_result(uuid, text, jsonb, text, boolean, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('queue_order_messages', 'mark_order_paid',
                            'claim_messages', 'record_message_result')
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'a messaging function is reachable from the browser';
  end if;
end $$;
