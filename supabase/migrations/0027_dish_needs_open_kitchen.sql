-- =============================================================================
-- 0027 — a dish is never on while its kitchen is shut
--
-- dish_is_on() let a dish's meal window be "the whole answer": a dish with its
-- own window was orderable for the whole window, whatever the kitchen's hours.
-- Lala Ram's breakfast runs 07:00-11:00 but the kitchen opens at 09:00, so for
-- two hours every morning guests could pay for food from a closed kitchen.
--
-- Now both must hold: the kitchen is open AND, when the dish has a window, the
-- time is inside it. One function still decides for get_menu, place_order and
-- the payment step (unavailable_in_order), so replacing it fixes all three.
--
-- Same signature, so this replaces rather than overloads.
-- =============================================================================

begin;

create or replace function public.dish_is_on(
  p_slot       text,
  p_starts     time,
  p_ends       time,
  p_opens      time,
  p_closes     time,
  p_sunday_off boolean,
  p_at         timestamptz default now()
) returns boolean
language sql
immutable
set search_path = public
as $$
  -- kitchen_is_open covers the Sunday closure; meal_is_on is true for all_day
  -- and for a window nobody filled in, so those dishes follow the kitchen alone.
  select public.kitchen_is_open(p_opens, p_closes, p_sunday_off, p_at)
     and public.meal_is_on(p_slot, p_starts, p_ends, p_at);
$$;

revoke all on function
  public.dish_is_on(text, time, time, time, time, boolean, timestamptz) from public;
grant execute on function
  public.dish_is_on(text, time, time, time, time, boolean, timestamptz)
  to anon, authenticated;

-- ---------------------------------------------------------------- self-check
-- IST wall-clock times on Monday 2026-09-28, given in UTC.
do $$
declare
  at_0800 timestamptz := '2026-09-28T02:30:00Z';  -- 08:00 IST
  at_1000 timestamptz := '2026-09-28T04:30:00Z';  -- 10:00 IST
  at_0030 timestamptz := '2026-09-28T19:00:00Z';  -- 00:30 IST Tuesday
begin
  -- breakfast 07-11 at a kitchen open 09-23: shut at 08:00, on at 10:00
  if public.dish_is_on('breakfast', '07:00', '11:00', '09:00', '23:00', false, at_0800) then
    raise exception 'a dish was on before its kitchen opened';
  end if;
  if not public.dish_is_on('breakfast', '07:00', '11:00', '09:00', '23:00', false, at_1000) then
    raise exception 'a dish inside its window and its kitchen''s hours was off';
  end if;
  -- all day at a kitchen open 10-23: shut at 00:30
  if public.dish_is_on('all_day', null, null, '10:00', '23:00', false, at_0030) then
    raise exception 'an all-day dish was on after its kitchen closed';
  end if;
  -- a window that runs past the kitchen's closing time: shut once it closes
  if public.dish_is_on('custom', '22:00', '02:00', '10:00', '23:00', false, at_0030) then
    raise exception 'a late window kept a dish on after its kitchen closed';
  end if;
  raise notice 'dish_is_on needs the kitchen open and the dish in its window';
end $$;

commit;
