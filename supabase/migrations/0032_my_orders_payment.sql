-- =============================================================================
-- 0032 — order history knows how each order is paid
--
-- The orders page now offers to pay a cash-on-delivery order online, right in
-- the list. A guest's list built from this device's receipt tokens already has
-- payment_method and is_paid (get_receipt, 0031); a signed-in guest's list
-- comes from get_my_orders, which did not. Same two fields, same meaning, so
-- both sources still feed the page identically (see 0015).
--
-- Return type changes, so this drops first: `create or replace` cannot alter a
-- function's return type.
-- =============================================================================

begin;

drop function if exists public.get_my_orders();

create function public.get_my_orders()
returns table (
  order_no       text,
  receipt_token  uuid,
  status         public.order_status,
  total_paise    int,
  created_at     timestamptz,
  guest_name     text,
  via_email      boolean,
  items          jsonb,
  payment_method text,
  is_paid        boolean
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
              from public.order_items i where i.order_id = o.id) as items,
           o.payment_method,
           case when o.payment_method = 'cod' then o.collected_at is not null
                else o.paid_at is not null end as is_paid
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

commit;
