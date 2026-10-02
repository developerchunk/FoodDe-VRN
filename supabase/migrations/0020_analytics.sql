-- =============================================================================
-- 0020 — the super admin's numbers
--
-- One function, one round trip: admin_analytics('today' | 'daily' | 'weekly'
-- | 'monthly') returns everything the dashboard draws, for the period and for
-- the one before it so each figure can say which way it moved.
--
--   today    since midnight, by hour         vs. all of yesterday
--   daily    the last 30 days, by day        vs. the 30 before
--   weekly   the last 12 weeks, by week      vs. the 12 before
--   monthly  the last 12 months, by month    vs. the 12 before
--
-- Every boundary is in IST. The server runs on UTC, and a "day" that ends at
-- 05:30 in Vrindavan would put dinner on the wrong date.
--
-- What counts: an order counts from the moment it was paid. Unpaid orders are
-- only counted as abandoned checkouts. A cancelled order counts as an order but
-- not as revenue, since its money goes back.
-- =============================================================================

begin;

create or replace function public.admin_analytics(p_period text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  tz         constant text := 'Asia/Kolkata';
  v_now      timestamp := now() at time zone tz;   -- wall clock in Vrindavan
  v_unit     text;
  v_step     interval;
  v_from     timestamp;
  v_to       timestamp;
  v_prev     timestamp;
  f          timestamptz;   -- the same boundaries, as instants
  t          timestamptz;
  pf         timestamptz;
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'super admins only' using errcode = '42501';
  end if;

  case p_period
    when 'today' then
      v_unit := 'hour';  v_step := interval '1 hour';
      v_from := date_trunc('day', v_now);
      v_to   := v_from + interval '1 day';
      v_prev := v_from - interval '1 day';
    when 'daily' then
      v_unit := 'day';   v_step := interval '1 day';
      v_to   := date_trunc('day', v_now) + interval '1 day';
      v_from := v_to - interval '30 days';
      v_prev := v_from - interval '30 days';
    when 'weekly' then
      v_unit := 'week';  v_step := interval '1 week';
      v_to   := date_trunc('week', v_now) + interval '1 week';
      v_from := v_to - interval '12 weeks';
      v_prev := v_from - interval '12 weeks';
    when 'monthly' then
      v_unit := 'month'; v_step := interval '1 month';
      v_to   := date_trunc('month', v_now) + interval '1 month';
      v_from := v_to - interval '12 months';
      v_prev := v_from - interval '12 months';
    else
      raise exception 'unknown period %', p_period using errcode = '22023';
  end case;

  f  := v_from at time zone tz;
  t  := v_to   at time zone tz;
  pf := v_prev at time zone tz;

  with
  paid as (
    select o.*,
           (o.status <> 'cancelled') as earns,
           o.paid_at >= f as is_now
      from public.orders o
     where o.paid_at >= pf and o.paid_at < t
  ),
  cur as (select * from paid where is_now),
  -- when each order's kitchens had all answered, and when it was delivered
  timing as (
    select c.id,
           extract(epoch from (max(tk.accepted_at) - c.paid_at)) / 60.0 as mins_to_accept,
           extract(epoch from (
             (select min(h.at) from public.order_status_history h
               where h.order_id = c.id and h.status = 'delivered') - c.paid_at)) / 60.0
             as mins_to_deliver,
           bool_and(tk.status = 'accepted') as all_accepted,
           bool_or(tk.status = 'rejected')  as any_rejected
      from cur c
      join public.order_tickets tk on tk.order_id = c.id
     group by c.id, c.paid_at
  ),
  kpi as (
    select p.is_now,
           count(*)                                         as orders,
           coalesce(sum(p.total_paise) filter (where p.earns), 0)    as revenue_paise,
           coalesce(sum(p.subtotal_paise) filter (where p.earns), 0) as food_paise,
           coalesce(sum(p.discount_paise) filter (where p.earns), 0) as discount_paise,
           count(*) filter (where p.status = 'cancelled')   as cancelled,
           count(*) filter (where p.status = 'delivered')   as delivered,
           count(distinct p.guest_phone)                    as guests,
           coalesce((select sum(i.qty) from public.order_items i
                      join paid q on q.id = i.order_id
                     where q.is_now = p.is_now and q.earns), 0) as items
      from paid p
     group by p.is_now
  ),
  abandoned as (
    select count(*) filter (where o.created_at >= f) as now_n,
           count(*) filter (where o.created_at <  f) as prev_n
      from public.orders o
     where o.paid_at is null
       and o.created_at >= pf and o.created_at < t
  ),
  series as (
    select b.bucket,
           count(c.id)                                                 as orders,
           coalesce(sum(c.total_paise) filter (where c.earns), 0)      as revenue_paise
      from generate_series(v_from, v_to - v_step, v_step) as b(bucket)
      left join cur c
        on date_trunc(v_unit, c.paid_at at time zone tz) = b.bucket
     group by b.bucket
  ),
  kitchens_ as (
    select k.id, k.place_name as name, k.is_active,
           count(distinct tk.order_id)                                   as orders,
           count(*) filter (where tk.status = 'accepted')                as accepted,
           count(*) filter (where tk.status = 'rejected')                as rejected,
           count(*) filter (where tk.escalated_at is not null)           as went_silent,
           round(avg(extract(epoch from (tk.accepted_at - c.paid_at)) / 60.0)
                 filter (where tk.accepted_at is not null and tk.responded_by = 'kitchen')::numeric, 1)
                                                                         as avg_mins_to_accept,
           coalesce((select sum(i.qty) from public.order_items i
                      join cur c2 on c2.id = i.order_id
                     where i.kitchen_id = k.id and c2.earns), 0)         as items,
           coalesce((select sum(i.line_total_paise) from public.order_items i
                      join cur c2 on c2.id = i.order_id
                     where i.kitchen_id = k.id and c2.earns), 0)         as food_paise
      from public.kitchens k
      left join public.order_tickets tk on tk.kitchen_id = k.id
                                       and tk.order_id in (select id from cur)
      left join cur c on c.id = tk.order_id
     group by k.id, k.place_name, k.is_active
  ),
  dishes as (
    select m.id, m.name, m.is_available, k.place_name as kitchen, cat.name as category,
           m.price_paise,
           coalesce(sum(i.qty), 0)                  as qty,
           coalesce(sum(i.line_total_paise), 0)     as revenue_paise,
           count(distinct i.order_id)               as orders
      from public.menu_items m
      join public.kitchens   k   on k.id = m.kitchen_id
      join public.categories cat on cat.id = m.category_id
      left join public.order_items i
        on i.menu_item_id = m.id
       and i.order_id in (select id from cur where earns)
     group by m.id, m.name, m.is_available, k.place_name, cat.name, m.price_paise
  ),
  places_ as (
    select pl.id, pl.name, pl.area, pl.is_active,
           (select count(*) from public.addresses a2 where a2.place_id = pl.id and a2.is_active) as rooms,
           count(c.id)                                             as orders,
           count(distinct c.address_id)                            as rooms_ordering,
           coalesce(sum(c.total_paise) filter (where c.earns), 0)  as revenue_paise
      from public.places pl
      left join public.addresses a on a.place_id = pl.id
      left join cur c on c.address_id = a.id
     group by pl.id, pl.name, pl.area, pl.is_active
  ),
  rooms_ as (
    select a.id, pl.name as place, a.room_number,
           count(c.id) as orders,
           coalesce(sum(c.total_paise) filter (where c.earns), 0) as revenue_paise
      from cur c
      join public.addresses a on a.id = c.address_id
      join public.places   pl on pl.id = a.place_id
     group by a.id, pl.name, a.room_number
  ),
  riders as (
    select d.id, d.name, d.is_active,
           count(f2.id)                                         as offered,
           count(*) filter (where f2.status = 'accepted')       as accepted,
           count(*) filter (where f2.status = 'declined')       as declined,
           count(*) filter (where f2.status in ('late', 'taken')) as missed,
           count(*) filter (where f2.status = 'offered')        as unanswered,
           round(avg(extract(epoch from (f2.responded_at - f2.created_at)) / 60.0)
                 filter (where f2.status = 'accepted')::numeric, 1) as avg_mins_to_accept,
           (select count(*) from cur c3
             where c3.delivery_partner_id = d.id and c3.status = 'delivered') as delivered,
           (select round(avg(extract(epoch from (h.at - c3.rider_assigned_at)) / 60.0)::numeric, 1)
              from cur c3
              join public.order_status_history h
                on h.order_id = c3.id and h.status = 'delivered'
             where c3.delivery_partner_id = d.id)                 as avg_mins_to_deliver
      from public.delivery_partners d
      left join public.delivery_offers f2
        on f2.delivery_partner_id = d.id
       and f2.order_id in (select id from cur)
     group by d.id, d.name, d.is_active
  ),
  coupons_ as (
    select c.coupon_code as code, count(*) as uses,
           coalesce(sum(c.discount_paise), 0) as discount_paise,
           coalesce(sum(c.total_paise), 0)    as revenue_paise
      from cur c
     where c.coupon_code is not null and c.earns
     group by c.coupon_code
  )
  select jsonb_build_object(
    'period',  p_period,
    'unit',    v_unit,
    'from',    f,
    'to',      t,
    'kpis', jsonb_build_object(
      'now',  (select to_jsonb(k) - 'is_now' from kpi k where k.is_now),
      'prev', (select to_jsonb(k) - 'is_now' from kpi k where not k.is_now)
    ),
    'abandoned', (select jsonb_build_object('now', now_n, 'prev', prev_n) from abandoned),
    'timing', (select jsonb_build_object(
                 'avg_mins_to_accept',  round(avg(mins_to_accept)::numeric, 1),
                 'avg_mins_to_deliver', round(avg(mins_to_deliver)::numeric, 1),
                 'all_accepted',        count(*) filter (where all_accepted),
                 'some_rejected',       count(*) filter (where any_rejected))
                 from timing),
    'statuses', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                   from (select status, count(*) n from cur group by status) s),
    'series',   (select coalesce(jsonb_agg(jsonb_build_object(
                   'at', s.bucket at time zone tz,
                   'orders', s.orders,
                   'revenue_paise', s.revenue_paise) order by s.bucket), '[]'::jsonb)
                   from series s),
    'kitchens', (select coalesce(jsonb_agg(to_jsonb(k) order by k.food_paise desc, k.name), '[]'::jsonb)
                   from kitchens_ k),
    'dishes',   (select coalesce(jsonb_agg(to_jsonb(d) order by d.revenue_paise desc, d.name), '[]'::jsonb)
                   from dishes d),
    'places',   (select coalesce(jsonb_agg(to_jsonb(p) order by p.revenue_paise desc, p.name), '[]'::jsonb)
                   from places_ p),
    'rooms',    (select coalesce(jsonb_agg(to_jsonb(r) order by r.orders desc, r.revenue_paise desc), '[]'::jsonb)
                   from (select * from rooms_ order by orders desc, revenue_paise desc limit 15) r),
    'riders',   (select coalesce(jsonb_agg(to_jsonb(r) order by r.delivered desc, r.accepted desc, r.name), '[]'::jsonb)
                   from riders r),
    'coupons',  (select coalesce(jsonb_agg(to_jsonb(c) order by c.uses desc), '[]'::jsonb)
                   from coupons_ c)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_analytics(text) from public, anon;
grant execute on function public.admin_analytics(text) to authenticated;

commit;
