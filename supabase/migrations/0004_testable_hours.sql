-- =============================================================================
-- 0004 — make the kitchen-hours rule testable
--
-- kitchen_is_open() read now() internally, so the only case anyone could ever
-- verify was "right now". Everything else — before opening, after closing, a
-- kitchen that shuts after midnight, a Sunday — was untestable by construction.
--
-- That matters because both failure directions cost money: a dish wrongly
-- hidden is a sale lost, and a dish wrongly orderable sends an order to a
-- kitchen with its shutters down.
--
-- The clock is now a parameter that defaults to now(), so callers are unchanged
-- and tests can ask about any moment. The test block at the bottom runs on
-- migrate and fails loudly if the rule is wrong.
-- =============================================================================

create or replace function public.kitchen_is_open(
  p_opens      time,
  p_closes     time,
  p_sunday_off boolean,
  p_at         timestamptz default now()
) returns boolean
language sql
immutable
set search_path = public
as $$
  with ist as (select (p_at at time zone 'Asia/Kolkata') as t)
  select case
    -- hours unknown: assume open rather than silently hiding a kitchen's menu
    when p_opens is null or p_closes is null then true
    when p_sunday_off and extract(dow from (select t from ist)) = 0 then false
    when p_closes > p_opens
      then (select t::time from ist) between p_opens and p_closes
    -- shuts after midnight, e.g. 18:00-02:00
    else (select t::time from ist) >= p_opens
      or (select t::time from ist) <= p_closes
  end;
$$;

-- --------------------------------------------------------------------- tests
do $$
declare
  -- a Friday and a Sunday, given as IST wall-clock converted to UTC
  fri_0730 timestamptz := '2026-09-25 02:00:00+00';  -- 07:30 IST Friday
  fri_0900 timestamptz := '2026-09-25 03:30:00+00';  -- 09:00 IST Friday
  fri_2330 timestamptz := '2026-09-25 18:00:00+00';  -- 23:30 IST Friday
  fri_0100 timestamptz := '2026-09-25 19:30:00+00';  -- 01:00 IST Saturday
  sun_1200 timestamptz := '2026-09-27 06:30:00+00';  -- 12:00 IST Sunday
  failures text := '';
begin
  -- a normal 08:00-23:00 kitchen
  if public.kitchen_is_open('08:00','23:00',false, fri_0730) then
    failures := failures || E'\n  open before opening time'; end if;
  if not public.kitchen_is_open('08:00','23:00',false, fri_0900) then
    failures := failures || E'\n  closed during opening hours'; end if;
  if public.kitchen_is_open('08:00','23:00',false, fri_2330) then
    failures := failures || E'\n  open after closing time'; end if;

  -- a kitchen that shuts after midnight
  if not public.kitchen_is_open('18:00','02:00',false, fri_2330) then
    failures := failures || E'\n  late kitchen shown closed at 23:30'; end if;
  if not public.kitchen_is_open('18:00','02:00',false, fri_0100) then
    failures := failures || E'\n  late kitchen shown closed at 01:00'; end if;
  if public.kitchen_is_open('18:00','02:00',false, fri_0900) then
    failures := failures || E'\n  late kitchen shown open at 09:00'; end if;

  -- Sundays off
  if public.kitchen_is_open('08:00','23:00',true, sun_1200) then
    failures := failures || E'\n  Sunday-off kitchen open on a Sunday'; end if;
  if not public.kitchen_is_open('08:00','23:00',true, fri_0900) then
    failures := failures || E'\n  Sunday-off kitchen closed on a Friday'; end if;

  -- unknown hours
  if not public.kitchen_is_open(null, null, false, fri_0730) then
    failures := failures || E'\n  kitchen with no hours treated as closed'; end if;

  if failures <> '' then
    raise exception 'kitchen_is_open is wrong:%', failures;
  end if;

  raise notice 'kitchen_is_open: all 9 cases pass';
end $$;
