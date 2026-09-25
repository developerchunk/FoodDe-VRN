-- =============================================================================
-- Replace the SECURITY DEFINER menu view with ordinary privileges.
--
-- Supabase's advisor flags definer views, and it is right to: they run as their
-- creator, so the querying user's RLS is skipped entirely. It worked here only
-- because the view happened not to select `kitchen_id`. That is a comment-level
-- guarantee — one careless `select *` in a future edit and the guest learns
-- which kitchen cooks their food.
--
-- This moves the guarantee down to the privilege layer instead. The view now
-- runs as the caller, and `kitchen_id` is simply not granted to the browser
-- roles, so no query written later can reach it.
-- =============================================================================

alter view public.public_menu set (security_invoker = true);

-- --------------------------------------------------------- row level access
-- The menu is public: anyone holding a QR code, signed in or not, may read the
-- available items. Note that anonymous sign-ins use the `authenticated` role,
-- so a policy granted to `authenticated` also covers guests who never signed
-- in — which is exactly what we want for the menu, and exactly what must be
-- checked for anything that should be permanent-account-only.
drop policy if exists menu_items_read_available on public.menu_items;
create policy menu_items_read_available on public.menu_items
  for select to anon, authenticated
  using (is_available);

drop policy if exists categories_read_active on public.categories;
create policy categories_read_active on public.categories
  for select to anon, authenticated
  using (is_active);

-- -------------------------------------------------------- column privileges
-- Supabase grants browser roles SELECT on public tables by default, which
-- includes every column. Take that back and hand out only the columns the menu
-- needs. `kitchen_id` is deliberately absent: it is the one column that would
-- reveal the order is being split across kitchens.
revoke select on public.menu_items from anon, authenticated;
grant select (
  id, category_id, name, description, price_paise,
  serves, image_url, is_sattvic, is_available, sort_order
) on public.menu_items to anon, authenticated;

revoke select on public.categories from anon, authenticated;
grant select (
  id, slug, name, description, sort_order, is_active
) on public.categories to anon, authenticated;

-- The view itself stays readable; it only ever touches granted columns.
grant select on public.public_menu to anon, authenticated;

-- =============================================================================
-- Helper for later: anonymous guests share the `authenticated` role, so
-- "is signed in" is not the same question as "has a real account". Anything
-- account-only — saved addresses, order history across devices — must ask this
-- rather than merely checking for a session.
-- =============================================================================
create or replace function public.is_permanent_user()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'is_anonymous')::boolean is not true
    and auth.uid() is not null,
    false
  );
$$;

grant execute on function public.is_permanent_user() to anon, authenticated;
