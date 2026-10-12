-- =============================================================================
-- 0028 — a kitchen with no hours is closed
--
-- kitchen_is_open() treated missing hours as "always open", so a kitchen saved
-- without them took orders at 3am -- money taken for food nobody would cook.
-- With real money moving, the safe reading of "we do not know when this
-- kitchen is open" is that it is not. Its dishes stay on the menu, marked
-- unavailable, until an admin sets its hours.
--
-- A kitchen that really is open round the clock is given the same opening and
-- closing time: the past-midnight branch then holds at every hour.
--
-- dish_is_on (0027) calls this, so get_menu, place_order and the payment step
-- all follow. Same signature, so this replaces rather than overloads.
-- =============================================================================

begin;

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
    -- hours not set: closed until an admin sets them
    when p_opens is null or p_closes is null then false
    when p_sunday_off and extract(dow from (select t from ist)) = 0 then false
    when p_closes > p_opens
      then (select t::time from ist) between p_opens and p_closes
    -- shuts after midnight, e.g. 18:00-02:00; equal times mean round the clock
    else (select t::time from ist) >= p_opens
      or (select t::time from ist) <= p_closes
  end;
$$;

revoke all on function public.kitchen_is_open(time, time, boolean, timestamptz) from public;
grant execute on function public.kitchen_is_open(time, time, boolean, timestamptz)
  to anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
declare
  at_1200 timestamptz := '2026-09-28T06:30:00Z';  -- 12:00 IST Monday
  at_0300 timestamptz := '2026-09-28T21:30:00Z';  -- 03:00 IST Tuesday
begin
  if public.kitchen_is_open(null, null, false, at_1200) then
    raise exception 'a kitchen with no hours was open';
  end if;
  if public.dish_is_on('all_day', null, null, null, null, false, at_1200) then
    raise exception 'a dish from a kitchen with no hours was on';
  end if;
  if not public.kitchen_is_open('00:00', '00:00', false, at_0300) then
    raise exception 'a round-the-clock kitchen (equal times) was shut at 03:00';
  end if;
  if not public.kitchen_is_open('09:00', '23:00', false, at_1200) then
    raise exception 'an ordinary kitchen was shut at noon';
  end if;
  raise notice 'kitchens with no hours are closed';
end $$;

commit;
