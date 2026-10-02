-- =============================================================================
-- 0023 — admin access lasts 30 minutes from sign-in
--
-- An admin or super admin must have signed in with Google in the last 30
-- minutes. After that every admin read, write and action is refused until they
-- sign in again -- even from a tab left open, even while Supabase keeps
-- refreshing the token, because the time checked is the sign-in itself.
--
-- That time comes from the access token's `amr` claim: Supabase writes when
-- each authentication method was used, signs it, and carries it unchanged
-- through every refresh. A token without it counts as not signed in.
--
-- Guests are untouched. This changes only admin_roles(), which nothing on the
-- guest side calls; their sessions last as long as they always did.
-- =============================================================================

begin;

-- When the caller last actually signed in (not when their token was refreshed).
create or replace function public.signed_in_at()
returns timestamptz
language sql
stable
as $$
  select to_timestamp(max((m ->> 'timestamp')::bigint))
    from jsonb_array_elements(
           case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
                then auth.jwt() -> 'amr' else '[]'::jsonb end) as m
   where (m ->> 'timestamp') ~ '^[0-9]+$';
$$;

-- The roles the caller's account holds, regardless of how long ago they signed in.
create or replace function public.admin_roles_held()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(distinct a.role order by a.role), '{}')
    from auth.users u
    join public.admin_users a on a.email = lower(u.email)
   where u.id = auth.uid()
     and u.email is not null
     and u.email_confirmed_at is not null
     and coalesce(u.is_anonymous, false) = false;
$$;

-- The roles in force right now: held, and signed in within 30 minutes. Every
-- policy and admin_ function goes through this, so the limit holds everywhere.
create or replace function public.admin_roles()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select case
           when public.signed_in_at() > now() - interval '30 minutes'
             then public.admin_roles_held()
           else '{}'::text[]
         end;
$$;

-- What the admin site asks: who am I, what may I do, and until when. `expired`
-- tells a held role that has timed out apart from no access at all, so the
-- page can say "sign in again" rather than "you are not an admin".
create or replace function public.admin_whoami()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'email',      (select lower(email) from auth.users where id = auth.uid()),
    'roles',      to_jsonb(public.admin_roles()),
    'expires_at', public.signed_in_at() + interval '30 minutes',
    'expired',    cardinality(public.admin_roles_held()) > 0
                  and cardinality(public.admin_roles()) = 0
  );
$$;

revoke all on function public.signed_in_at()     from public, anon;
revoke all on function public.admin_roles_held() from public, anon, authenticated;
grant execute on function public.signed_in_at() to authenticated;

commit;
