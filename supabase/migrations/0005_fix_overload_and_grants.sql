-- =============================================================================
-- 0005 — repair get_menu(), and stop handing out EXECUTE by accident
--
-- 0004 added a 4th parameter to kitchen_is_open(). `create or replace function`
-- only replaces when the signature matches, so that created a second function
-- rather than replacing the first. The three-argument call inside get_menu()
-- then matched both — the old 3-arg version and the new one via its default —
-- and Postgres refused to choose:
--
--   function public.kitchen_is_open(time, time, boolean) is not unique
--
-- get_menu() is the only way the browser can read the menu, so for as long as
-- that ambiguity stood, the menu did not load at all.
--
-- Second, smaller thing: Postgres grants EXECUTE on new functions to PUBLIC by
-- default. Only the three functions written with an explicit `revoke` were
-- actually restricted; new_code() and the rest were reachable from any browser
-- without anyone deciding they should be.
-- =============================================================================

-- Drop the stale three-argument version. The four-argument one from 0004
-- answers the same call, because its p_at defaults to now().
drop function if exists public.kitchen_is_open(time, time, boolean);

-- ------------------------------------------------------------------- grants
-- Deliberate from here, rather than inherited.

-- Internal: mints ids, used as a column default during import. A browser has
-- no business calling it, and nothing about it needs to be public.
revoke all on function public.new_code() from public, anon, authenticated;
grant execute on function public.new_code() to service_role;

-- Deliberately callable. It is a pure function over arguments the caller
-- supplies — it reads no table and reveals nothing about any real kitchen —
-- and keeping it reachable is what lets `npm run verify:hours` prove the
-- opening-hours rule against the deployed database from outside.
revoke all on function public.kitchen_is_open(time, time, boolean, timestamptz) from public;
grant execute on function public.kitchen_is_open(time, time, boolean, timestamptz)
  to anon, authenticated, service_role;

-- Tells a caller only about themselves.
revoke all on function public.is_permanent_user() from public;
grant execute on function public.is_permanent_user() to anon, authenticated;

-- Unchanged, restated so every function's grant is visible in one place.
revoke all on function public.get_menu() from public;
grant execute on function public.get_menu() to anon, authenticated;

revoke all on function public.resolve_address(text) from public;
grant execute on function public.resolve_address(text) to anon, authenticated;

revoke all on function public.get_receipt(uuid) from public;
grant execute on function public.get_receipt(uuid) to anon, authenticated;

-- --------------------------------------------------------------------- test
-- The bug was that get_menu() stopped working. Prove it works.
do $$
declare n int;
begin
  select count(*) into n from public.get_menu();
  raise notice 'get_menu() returns % row(s)', n;
end $$;
