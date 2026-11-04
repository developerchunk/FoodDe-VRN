-- =============================================================================
-- 0033 — what guests do on the site, without knowing who they are
--
-- Orders tell the super admin what sold (0020). This tells them what happened
-- on the way: which rooms scan, which dishes are looked at and added and then
-- left behind, how many reach checkout, tap pay, and fail to pay.
--
-- Anonymous by construction, not by promise:
--
--   * An event carries a visit id the browser makes up for that tab
--     (crypto.randomUUID, kept in sessionStorage, gone when the tab closes).
--     It is not the Supabase user, not the phone, not the email, and nothing
--     here or in the browser ties it to an order.
--   * The browser sends events with the publishable key alone, never the
--     guest's session token, so the database does not even see who is signed
--     in. No IP address or user agent is stored.
--   * What is stored is the room (from the QR, the same room an order would
--     go to), the dish, the page, a coarse device class and a few small
--     values. Free text is never accepted, except a menu search, which the
--     browser trims to 40 characters.
--
-- Writes go only through track_events(), which checks every field. Reads go
-- only through admin_activity() and admin_activity_log(), which refuse anyone
-- but a super admin. The table itself is closed to every API role.
-- =============================================================================

begin;

create table if not exists public.activity_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  sid         uuid not null,                 -- one browser tab's visit, random
  name        text not null,
  device      text check (device in ('phone', 'tablet', 'desktop')),
  page        text,                          -- the route, never its ids
  address_id  text,                          -- the room, if one was scanned
  place_id    text,                          -- its accommodation partner
  item_id     text,                          -- the dish, for dish events
  value_paise int,
  props       jsonb not null default '{}'::jsonb
);
-- No foreign keys: a dish or room deleted later should not have to rewrite
-- the history, and a log should never block an admin's delete.

create index if not exists activity_events_at_idx      on public.activity_events (at);
create index if not exists activity_events_sid_at_idx  on public.activity_events (sid, at);
create index if not exists activity_events_name_at_idx on public.activity_events (name, at);

alter table public.activity_events enable row level security;
revoke all on public.activity_events from public, anon, authenticated;
-- RLS on with no policy: even a super admin reads through the functions below.

-- ------------------------------------------------------------------- ingest
-- Called by the browser in small batches. Anything malformed is dropped
-- rather than refused: a bad event must never surface as an error to a guest.
create or replace function public.track_events(p_sid uuid, p_device text, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  v_names constant text[] := array[
    'session_start', 'page_view',
    'qr_scan', 'qr_invalid', 'room_needed',
    'dish_view', 'menu_search',
    'cart_add', 'cart_remove', 'coupon_apply',
    'checkout_view', 'checkout_submit', 'order_placed', 'order_error',
    'payment_open', 'payment_success', 'payment_failed', 'payment_dismissed',
    'payment_unverified', 'payment_error', 'payment_timeout',
    'cod_confirmed'
  ];
  v_device text := case when p_device in ('phone', 'tablet', 'desktop') then p_device end;
begin
  if p_sid is null
     or jsonb_typeof(p_events) is distinct from 'array' then
    return;
  end if;
  if jsonb_array_length(p_events) not between 1 and 50 then
    return;
  end if;

  -- A page stuck in a loop, or someone filling the table by hand: one visit
  -- gets a generous 500 events per ten minutes, then is ignored.
  if (select count(*) from public.activity_events
       where sid = p_sid and at > now() - interval '10 minutes') > 500 then
    return;
  end if;

  insert into public.activity_events
    (at, sid, name, device, page, address_id, place_id, item_id, value_paise, props)
  select
    -- events wait in the browser a few seconds before they are sent; `ago`
    -- puts each back at the moment it happened (at most ten minutes back)
    now() - make_interval(secs => case when jsonb_typeof(t.e -> 'ago') = 'number'
                                       then least(greatest((t.e ->> 'ago')::numeric, 0), 600000) / 1000.0
                                       else 0 end),
    p_sid,
    t.e ->> 'n',
    v_device,
    case when t.e ->> 'p' ~ '^/[a-z/-]{0,39}$' then t.e ->> 'p' end,
    a.id,
    a.place_id,
    m.id,
    case when jsonb_typeof(t.e -> 'v') = 'number'
         then least(greatest((t.e ->> 'v')::numeric, 0), 100000000)::int end,
    case when jsonb_typeof(t.e -> 'x') = 'object' and length((t.e -> 'x')::text) <= 600
         then t.e -> 'x' else '{}'::jsonb end
    from jsonb_array_elements(p_events) as t(e)
    left join public.addresses  a on a.id = t.e ->> 'r'
    left join public.menu_items m on m.id = t.e ->> 'i'
   where jsonb_typeof(t.e) = 'object'
     and t.e ->> 'n' = any (v_names);
end $$;

revoke all on function public.track_events(uuid, text, jsonb) from public;
grant execute on function public.track_events(uuid, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ reports
-- Everything the Activity page draws, for [p_from, p_to) and a comparison
-- window [p_prev_from, p_prev_to). Left out, the comparison is the same length
-- immediately before; the page passes its own for like-for-like comparisons
-- (today so far against yesterday up to this time, a month against the one
-- before it).
--
-- p_unit buckets the series: hour, day, week or month, in IST.
-- p_hour_from / p_hour_to keep only events in those IST hours of each day,
-- [from, to); 22 -> 2 wraps past midnight; equal means the whole day.
--
-- A visit "bought" when it saw a payment succeed or a cash-on-delivery order
-- confirmed. That is the visit's own word, not the orders table: nothing
-- links the two, by design.
create or replace function public.admin_activity(
  p_from      timestamptz,
  p_to        timestamptz,
  p_unit      text,
  p_hour_from int default 0,
  p_hour_to   int default 24,
  p_prev_from timestamptz default null,
  p_prev_to   timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  tz       constant text := 'Asia/Kolkata';
  buys     constant text[] := array['payment_success', 'cod_confirmed'];
  v_pf     timestamptz := coalesce(p_prev_from, p_from - (p_to - p_from));
  v_pt     timestamptz := least(coalesce(p_prev_to, p_from), p_from);
  v_hf     int := coalesce(p_hour_from, 0);
  v_ht     int := coalesce(p_hour_to, 24);
  v_all    boolean;
  v_step   interval;
  v_first  timestamp;
  v_last   timestamp;
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'super admins only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or v_pf >= v_pt then
    raise exception 'that time range is empty' using errcode = '22023';
  end if;
  if p_unit not in ('hour', 'day', 'week', 'month') then
    raise exception 'unknown unit %', p_unit using errcode = '22023';
  end if;
  if v_hf not between 0 and 23 or v_ht not between 1 and 24 then
    raise exception 'hours run from 0 to 24' using errcode = '22023';
  end if;
  v_all  := v_hf = 0 and v_ht = 24 or v_hf = v_ht;
  v_step := ('1 ' || p_unit)::interval;
  v_first := date_trunc(p_unit, p_from at time zone tz);
  v_last  := date_trunc(p_unit, (p_to - interval '1 microsecond') at time zone tz);
  if (select count(*) from generate_series(v_first, v_last, v_step)) > 1000 then
    raise exception 'too many % buckets for this range', p_unit using errcode = '22023';
  end if;

  with
  ev as (
    select e.*, e.at >= p_from as is_now,
           extract(hour from e.at at time zone tz)::int as hr
      from public.activity_events e
     where (e.at >= p_from and e.at < p_to)
        or (e.at >= v_pf and e.at < v_pt)
  ),
  evh as (
    select * from ev
     where v_all
        or (v_hf < v_ht and hr >= v_hf and hr < v_ht)
        or (v_hf > v_ht and (hr >= v_hf or hr < v_ht))
  ),
  -- one row per visit per window: how far it got
  sess as (
    select is_now, sid,
           min(at)                                           as first_at,
           max(device)                                       as device,
           bool_or(name = 'qr_scan')                         as scanned,
           bool_or(name = 'page_view' and page = '/menu')    as saw_menu,
           bool_or(name = 'dish_view')                       as viewed_dish,
           bool_or(name = 'cart_add')                        as added,
           bool_or(name = 'checkout_view')                   as checkout,
           bool_or(name = 'checkout_submit')                 as submitted,
           bool_or(name = 'payment_open')                    as pay_open,
           bool_or(name = any (buys))                        as bought,
           bool_or(name = 'payment_failed')                  as pay_failed,
           -- `returning` is a reserved word: fine as an output label, not as a column to read
           bool_or(name = 'session_start' and props ->> 'returning' = 'true') as is_returning,
           min(at) filter (where name = any (buys))          as bought_at,
           max(value_paise) filter (where name = 'checkout_view') as cart_value
      from evh
     group by is_now, sid
  ),
  kpi_s as (
    select is_now,
           count(*)                                          as visits,
           count(*) filter (where scanned)                   as scanned,
           count(*) filter (where saw_menu)                  as saw_menu,
           count(*) filter (where added)                     as added,
           count(*) filter (where checkout)                  as checkout,
           count(*) filter (where submitted)                 as submitted,
           count(*) filter (where pay_open)                  as pay_open,
           count(*) filter (where bought)                    as bought,
           count(*) filter (where pay_failed)                as pay_failed_visits,
           count(*) filter (where added and not bought)      as carts_abandoned,
           count(*) filter (where checkout and not bought)   as checkouts_abandoned,
           coalesce(sum(cart_value) filter (where checkout and not bought), 0) as abandoned_value_paise,
           count(*) filter (where is_returning)              as returning,
           round((percentile_cont(0.5) within group
                   (order by extract(epoch from (bought_at - first_at)) / 60.0)
                   filter (where bought))::numeric, 1)      as mins_to_order
      from sess
     group by is_now
  ),
  kpi_e as (
    select is_now,
           count(*) filter (where name = 'page_view')        as page_views,
           count(*) filter (where name = 'qr_scan')          as scans,
           count(*) filter (where name = 'qr_invalid')       as bad_scans,
           count(*) filter (where name = 'dish_view')        as dish_views,
           count(*) filter (where name = 'cart_add')         as adds,
           count(*) filter (where name = 'cart_remove')      as removes,
           count(*) filter (where name = 'cart_remove' and page = '/cart') as removes_at_checkout,
           count(*) filter (where name = 'payment_failed')   as payments_failed,
           count(*) filter (where name = 'payment_open')     as payments_opened,
           count(distinct address_id)                        as rooms,
           count(distinct place_id)                          as places
      from evh
     group by is_now
  ),
  kpi as (
    select s.is_now, to_jsonb(s) - 'is_now' || coalesce(to_jsonb(e) - 'is_now', '{}'::jsonb) as j
      from kpi_s s left join kpi_e e on e.is_now = s.is_now
  ),
  series as (
    select b.bucket,
           count(distinct e.sid)                                      as visits,
           count(distinct e.sid) filter (where e.name = 'qr_scan')    as scans,
           count(distinct e.sid) filter (where e.name = 'cart_add')   as added,
           count(distinct e.sid) filter (where e.name = 'checkout_view') as checkout,
           count(distinct e.sid) filter (where e.name = any (buys))   as bought,
           count(*) filter (where e.name = 'payment_failed')          as failed
      from generate_series(v_first, v_last, v_step) as b(bucket)
      left join evh e
        on e.is_now and date_trunc(p_unit, e.at at time zone tz) = b.bucket
     group by b.bucket
  ),
  heat as (
    select extract(isodow from at at time zone tz)::int as d, hr as h,
           count(distinct sid)                               as visits,
           count(distinct sid) filter (where name = any (buys)) as bought
      from evh
     where is_now
     group by 1, 2
  ),
  places_ as (
    select pl.id, pl.name, pl.area, pl.is_active,
           (select count(*) from public.addresses a2
             where a2.place_id = pl.id and a2.is_active)                          as rooms,
           count(distinct e.address_id) filter (where e.is_now)                    as rooms_active,
           count(distinct e.sid) filter (where e.is_now)                           as visits,
           count(distinct e.sid) filter (where e.is_now and e.name = 'qr_scan')    as scans,
           count(distinct e.sid) filter (where not e.is_now and e.name = 'qr_scan') as prev_scans,
           count(distinct e.sid) filter (where e.is_now and e.name = 'cart_add')   as added,
           count(distinct e.sid) filter (where e.is_now and e.name = 'checkout_view') as checkout,
           count(distinct e.sid) filter (where e.is_now and e.name = any (buys))   as bought,
           max(e.at) filter (where e.is_now)                                       as last_seen
      from public.places pl
      left join evh e on e.place_id = pl.id
     group by pl.id, pl.name, pl.area, pl.is_active
  ),
  rooms_ as (
    select a.id, pl.name as place, a.room_number,
           count(distinct e.sid)                                    as visits,
           count(distinct e.sid) filter (where e.name = 'qr_scan')  as scans,
           count(distinct e.sid) filter (where e.name = 'cart_add') as added,
           count(distinct e.sid) filter (where e.name = 'checkout_view') as checkout,
           count(distinct e.sid) filter (where e.name = any (buys)) as bought,
           max(e.at)                                                as last_seen
      from evh e
      join public.addresses a on a.id = e.address_id
      join public.places   pl on pl.id = a.place_id
     where e.is_now
     group by a.id, pl.name, a.room_number
  ),
  -- the dishes each buying visit actually paid for, as its purchase event listed them
  bought_items as (
    select distinct e.sid, x.item_id
      from evh e
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(e.props -> 'items') = 'array' then e.props -> 'items' else '[]'::jsonb end
      ) as x(item_id)
     where e.is_now and e.name = any (buys)
  ),
  items_ as (
    select m.id, m.name, m.is_available, k.place_name as kitchen,
           count(*) filter (where e.name = 'dish_view')                       as views,
           count(*) filter (where e.name = 'cart_add')                        as adds,
           count(distinct e.sid) filter (where e.name = 'cart_add')           as add_visits,
           count(distinct e.sid) filter (where e.name = 'cart_add' and bi.sid is not null) as ordered_visits,
           count(distinct e.sid) filter (where e.name = 'cart_add' and bi.sid is null)     as not_ordered_visits,
           count(*) filter (where e.name = 'cart_remove')                     as removes,
           count(*) filter (where e.name = 'cart_remove' and e.page = '/cart') as removes_at_checkout
      from evh e
      join public.menu_items m on m.id = e.item_id
      join public.kitchens   k on k.id = m.kitchen_id
      left join bought_items bi on bi.sid = e.sid and bi.item_id = e.item_id
     where e.is_now
     group by m.id, m.name, m.is_available, k.place_name
  ),
  cur as (select * from evh where is_now)
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'prev_from', v_pf, 'prev_to', v_pt, 'unit', p_unit,
    'kpis', jsonb_build_object(
      'now',  (select j from kpi where is_now),
      'prev', (select j from kpi where not is_now)
    ),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
                 'at', s.bucket at time zone tz, 'visits', s.visits, 'scans', s.scans,
                 'added', s.added, 'checkout', s.checkout, 'bought', s.bought,
                 'failed', s.failed) order by s.bucket), '[]'::jsonb)
                 from series s),
    -- aliased x, not h: inside heat, `h` is the hour column and would win
    'heat', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from heat x),
    'places', (select coalesce(jsonb_agg(to_jsonb(p) order by p.scans desc, p.visits desc, p.name), '[]'::jsonb)
                 from places_ p),
    'rooms', (select coalesce(jsonb_agg(to_jsonb(r) order by r.scans desc, r.visits desc), '[]'::jsonb)
                from (select * from rooms_ order by scans desc, visits desc limit 30) r),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.adds desc, i.views desc, i.name), '[]'::jsonb)
                from items_ i),
    'payments', jsonb_build_object(
      'outcomes', (select coalesce(jsonb_object_agg(name, n), '{}'::jsonb)
                     from (select name, count(*) n from cur
                            where name like 'payment\_%' or name in ('cod_confirmed', 'order_error')
                            group by name) o),
      'methods',  (select coalesce(jsonb_object_agg(m, n), '{}'::jsonb)
                     from (select coalesce(props ->> 'method', 'unknown') m, count(*) n from cur
                            where name = 'checkout_submit' group by 1) o),
      'reasons',  (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'reason', reason, 'n', n)
                                             order by n desc), '[]'::jsonb)
                     from (select name, coalesce(nullif(props ->> 'reason', ''), 'not given') reason, count(*) n
                             from cur
                            where name in ('payment_failed', 'payment_error', 'order_error')
                            group by 1, 2 order by n desc limit 15) o)
    ),
    'devices', (select coalesce(jsonb_object_agg(coalesce(device, 'unknown'), n), '{}'::jsonb)
                  from (select device, count(*) n from sess where is_now group by device) d),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', views, 'visits', visits)
                                        order by views desc), '[]'::jsonb)
                from (select page, count(*) views, count(distinct sid) visits from cur
                       where name = 'page_view' and page is not null group by page) p),
    'searches', (select coalesce(jsonb_agg(jsonb_build_object('q', q, 'n', n, 'empty', empty)
                                           order by n desc), '[]'::jsonb)
                   from (select lower(props ->> 'q') q, count(*) n,
                                count(*) filter (where props ->> 'results' = '0') empty
                           from cur where name = 'menu_search' and coalesce(props ->> 'q', '') <> ''
                          group by 1 order by n desc limit 25) s),
    'coupons', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'n', n) order by n desc), '[]'::jsonb)
                  from (select upper(props ->> 'code') code, count(*) n from cur
                         where name = 'coupon_apply' and coalesce(props ->> 'code', '') <> ''
                         group by 1 order by n desc limit 15) c),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('from', src, 'n', n) order by n desc), '[]'::jsonb)
                  from (select coalesce(nullif(props ->> 'from', ''), 'direct') src, count(*) n from cur
                         where name = 'session_start' group by 1 order by n desc limit 10) s)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.admin_activity(timestamptz, timestamptz, text, int, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_activity(timestamptz, timestamptz, text, int, int, timestamptz, timestamptz) to authenticated;

-- The raw history, newest first, a page at a time (p_before is the last id
-- already shown). Narrowed to one kind of event, or to one visit to follow
-- its journey from scan to payment.
create or replace function public.admin_activity_log(
  p_from   timestamptz,
  p_to     timestamptz,
  p_before bigint default null,
  p_limit  int default 100,
  p_name   text default null,
  p_sid    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_rows jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'super admins only' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]'::jsonb) into v_rows
    from (
      select e.id, e.at, e.sid, e.name, e.page, e.device, e.value_paise, e.props,
             pl.name as place, a.room_number as room, m.name as item
        from public.activity_events e
        left join public.addresses  a  on a.id  = e.address_id
        left join public.places     pl on pl.id = e.place_id
        left join public.menu_items m  on m.id  = e.item_id
       where e.at >= p_from and e.at < p_to
         and (p_before is null or e.id < p_before)
         and (p_name is null or e.name = p_name)
         and (p_sid is null or e.sid = p_sid)
       order by e.id desc
       limit least(greatest(coalesce(p_limit, 100), 1), 5000)
    ) r;

  return v_rows;
end $$;

revoke all on function public.admin_activity_log(timestamptz, timestamptz, bigint, int, text, uuid) from public, anon;
grant execute on function public.admin_activity_log(timestamptz, timestamptz, bigint, int, text, uuid) to authenticated;

commit;
