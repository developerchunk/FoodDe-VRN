-- An order placed as a guest, claimed later by signing in with that e-mail.
--
-- Linking Google covers the same device: the anonymous user keeps its id, so
-- its orders stay visible. It does not cover a guest who ordered on the phone
-- in their room and later signs in on a laptop -- different session, different
-- anonymous id, and the RLS policy on orders is `guest_user_id = auth.uid()`.
--
-- What ties the two together is the e-mail they typed at checkout. Typing an
-- address proves nothing on its own, but signing in with Google does: the
-- provider asserts the address, and Supabase records that as a confirmed
-- e-mail. So the test is not "did they type this address" but "has this
-- address been verified for the account asking".
--
-- Reading, not reassigning. Moving guest_user_id to the new account would take
-- the order away from whoever actually placed it -- which is the wrong outcome
-- when someone mistypes an address that happens to belong to a real person.
--
-- SECURITY DEFINER because the check needs auth.users.email_confirmed_at, which
-- the caller cannot read. The function takes no arguments for the same reason
-- place_order takes no total: there is nothing for a caller to lie about.
create or replace function public.get_my_orders()
returns table (
  order_no      text,
  receipt_token uuid,
  status        public.order_status,
  total_paise   int,
  created_at    timestamptz,
  guest_name    text,
  via_email     boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Only a confirmed address counts. An anonymous user has no e-mail at all,
  -- so this also keeps guests to their own orders.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid
     and u.email is not null
     and u.email_confirmed_at is not null;

  return query
    select o.order_no, o.receipt_token, o.status, o.total_paise,
           o.created_at, o.guest_name,
           (o.guest_user_id is distinct from v_uid) as via_email
      from public.orders o
     where o.guest_user_id = v_uid
        or (v_email is not null
            and o.guest_email is not null
            and lower(o.guest_email) = v_email)
     order by o.created_at desc;
end $$;

revoke all on function public.get_my_orders() from public;
revoke all on function public.get_my_orders() from anon;
grant execute on function public.get_my_orders() to authenticated;

-- ---------------------------------------------------------------- self-check
do $$
declare
  v_anon_grant boolean;
begin
  select exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'get_my_orders' and grantee = 'anon'
  ) into v_anon_grant;
  if v_anon_grant then
    raise exception 'get_my_orders is reachable by anon';
  end if;
  raise notice 'get_my_orders: authenticated only';
end $$;
