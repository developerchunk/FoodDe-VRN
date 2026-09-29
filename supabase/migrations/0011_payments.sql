-- Razorpay: attaching a payment to an order, and marking it paid.
--
-- Two different callers confirm the same payment: the browser comes back from
-- the checkout modal with a signature, and Razorpay's webhook arrives
-- independently. Either may be first, both may arrive, and one may never come
-- at all -- a guest who pays and closes the tab must still get fed. So the
-- transition lives here, once, and is idempotent: whoever gets there first
-- moves the order, and the loser is told it was already paid rather than
-- getting an error.
--
-- No new tables: orders already carries razorpay_order_id, razorpay_payment_id
-- and paid_at.

-- The webhook arrives knowing only Razorpay's order id.
create index if not exists orders_razorpay_order_idx
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

-- ------------------------------------------------- attaching a Razorpay order
-- Called from the edge function after Razorpay mints its order. Returns the
-- amount from the database rather than accepting one, so nothing upstream can
-- decide what this order costs.
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
begin
  select * into v_order from public.orders where receipt_token = p_token;
  if not found then
    raise exception 'no such order' using errcode = '22023';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'that order is not awaiting payment' using errcode = '22023';
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

revoke all on function public.attach_razorpay_order(uuid, text) from public;
-- Only the edge function, which holds the secret key. Never the browser: it
-- would let anyone move an order's razorpay_order_id around.
revoke all on function public.attach_razorpay_order(uuid, text) from anon, authenticated;

-- --------------------------------------------------------------- marking paid
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
      'order_no',    v_order.order_no,
      'status',      v_order.status,
      'already_paid', true
    );
  end if;

  update public.orders
     set status              = 'paid',
         razorpay_payment_id = p_payment_id,
         paid_at             = now()
   where id = v_order.id;

  return jsonb_build_object(
    'order_no',     v_order.order_no,
    'status',       'paid',
    'already_paid', false
  );
end $$;

revoke all on function public.mark_order_paid(text, text) from public;
-- The browser must never be able to call this. Payment is confirmed by a
-- signature the browser cannot forge, checked in an edge function that holds
-- the key secret -- not by the browser saying so.
revoke all on function public.mark_order_paid(text, text) from anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('mark_order_paid', 'attach_razorpay_order')
       and grantee in ('anon', 'authenticated')
  ) into v_exists;
  if v_exists then
    raise exception 'a payment function is reachable from the browser';
  end if;
  raise notice 'payment functions are not callable by anon or authenticated';
end $$;
