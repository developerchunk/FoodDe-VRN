-- get_my_orders forgot the items.
--
-- The orders page lists what was in each order. Built from this device's
-- receipt tokens it calls get_receipt, which returns an `items` array. 0014
-- gave signed-in guests a different source that returned only the header
-- fields, so the page called .map() on undefined and rendered nothing at all --
-- a blank screen, not a missing line.
--
-- Same item shape as get_receipt, so both paths feed the page identically and
-- one cannot drift into crashing the other again.
--
-- Return type changes, so this drops first: `create or replace` cannot alter a
-- function's return type, and a differing signature would create an overload.
drop function if exists public.get_my_orders();

create function public.get_my_orders()
returns table (
  order_no      text,
  receipt_token uuid,
  status        public.order_status,
  total_paise   int,
  created_at    timestamptz,
  guest_name    text,
  via_email     boolean,
  items         jsonb
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
           (o.guest_user_id is distinct from v_uid) as via_email,
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'id',   i.id,
                     'name', i.name_snapshot, 'qty', i.qty,
                     'unit_price_paise', i.unit_price_paise,
                     'line_total_paise', i.line_total_paise
                   ) order by i.name_snapshot), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id) as items
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
