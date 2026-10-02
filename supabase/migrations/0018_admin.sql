-- =============================================================================
-- 0018 — the admin site: who may use it, and what each role may touch
--
-- Two roles, held per e-mail address:
--
--   admin        runs the business day to day: kitchens, dishes, categories,
--                places and rooms, delivery partners, orders, settings.
--   super_admin  watches it: the analytics, and the coupons.
--
-- One person may hold both (one row each). Nobody signs in with a password:
-- they sign in with Google, and the address Google confirms is looked up here.
-- An anonymous guest session has no e-mail at all, so it can never match.
--
-- Everything below is enforced in the database. The admin pages are only a
-- convenience; the publishable key reaches anyone, so a check that lived only
-- in the browser would be no check at all.
-- =============================================================================

begin;

-- --------------------------------------------------------------- who is who
create table if not exists public.admin_users (
  email     text not null check (email = lower(trim(email)) and email like '%@%'),
  role      text not null check (role in ('admin', 'super_admin')),
  added_at  timestamptz not null default now(),
  primary key (email, role)
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- The roles of whoever is calling. A definer function, because the caller can
-- read neither auth.users nor admin_users -- and must not be able to list who
-- the admins are.
create or replace function public.admin_roles()
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

create or replace function public.is_admin()
returns boolean language sql stable set search_path = public
as $$ select 'admin' = any (public.admin_roles()) $$;

create or replace function public.is_super_admin()
returns boolean language sql stable set search_path = public
as $$ select 'super_admin' = any (public.admin_roles()) $$;

-- What the admin site asks on load: am I anybody?
create or replace function public.admin_whoami()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'email', (select lower(email) from auth.users where id = auth.uid()),
    'roles', to_jsonb(public.admin_roles())
  );
$$;

revoke all on function public.admin_roles()    from public, anon;
revoke all on function public.is_admin()       from public, anon;
revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.admin_whoami()   from public, anon;
grant execute on function public.admin_roles()    to authenticated;
grant execute on function public.is_admin()       to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.admin_whoami()   to authenticated;

-- ------------------------------------------------------------------ settings
-- Small business values that change without a deploy. The edge functions read
-- them with the secret key; admins edit them on the settings page.
create table if not exists public.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

insert into public.settings (key, value) values
  -- where "a kitchen rejected", "nobody answered" and "no rider" alerts go
  ('admin_whatsapp', '9510471455')
on conflict (key) do nothing;

alter table public.settings enable row level security;
revoke all on public.settings from anon, authenticated;

-- ------------------------------------------------------- the admin's tables
-- The API roles get the table privileges; the policies decide who they apply
-- to. A guest -- anonymous or signed in with Google -- matches no policy and so
-- sees no row and can change none.
grant select, insert, update, delete on
  public.kitchens, public.menu_items, public.categories,
  public.places, public.addresses, public.delivery_partners
  to authenticated;
grant select, update on public.settings to authenticated;

-- Every id column defaults to new_code(), and a default runs with the caller's
-- privileges, so an admin adding a kitchen needs to be able to call it. 0005
-- took it away from the browser; giving it back to signed-in users is safe --
-- it returns ten random characters and reads nothing.
grant execute on function public.new_code() to authenticated;
grant select on public.meal_windows to authenticated;
grant select on public.orders, public.order_items, public.order_tickets,
                public.message_log
  to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['kitchens', 'menu_items', 'categories', 'places',
                           'addresses', 'delivery_partners']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_admin_all', t);
    -- the analytics name things, so the super admin may read them
    execute format('drop policy if exists %I on public.%I', t || '_super_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.is_super_admin()))',
      t || '_super_read', t);
  end loop;

  -- Orders and what hangs off them: readable to both roles. Never writable
  -- directly -- every change goes through a function that knows the rules.
  foreach t in array array['orders', 'order_items', 'order_tickets', 'message_log']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.is_admin()) or (select public.is_super_admin()))',
      t || '_staff_read', t);
  end loop;
end $$;

drop policy if exists settings_admin_read on public.settings;
create policy settings_admin_read on public.settings
  for select to authenticated using ((select public.is_admin()));
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists meal_windows_admin_read on public.meal_windows;
create policy meal_windows_admin_read on public.meal_windows
  for select to authenticated using ((select public.is_admin()) or (select public.is_super_admin()));

-- Coupons belong to the super admin alone.
drop policy if exists coupons_super_all on public.coupons;
create policy coupons_super_all on public.coupons
  for all to authenticated
  using ((select public.is_super_admin())) with check (public.is_super_admin());

-- Guards the values a form can get wrong in ways a constraint has not caught.
alter table public.coupons drop constraint if exists coupons_value_sane;
alter table public.coupons add constraint coupons_value_sane
  check (value > 0 and (kind <> 'percent' or value <= 100) and min_order_paise >= 0);
alter table public.coupons drop constraint if exists coupons_code_shape;
alter table public.coupons add constraint coupons_code_shape
  check (code = upper(code) and code ~ '^[A-Z0-9]{3,20}$');

-- ---------------------------------------------------------------- dish photos
-- Public: a dish photo is on the menu for everyone to see anyway. Only an
-- admin may put one there, replace it or remove it. The browser shrinks every
-- photo to a 480x480 JPEG before upload; the limits here are the backstop.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 524288, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists menu_images_admin_read   on storage.objects;
drop policy if exists menu_images_admin_insert on storage.objects;
drop policy if exists menu_images_admin_update on storage.objects;
drop policy if exists menu_images_admin_delete on storage.objects;
create policy menu_images_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());
create policy menu_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_admin());
create policy menu_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());
create policy menu_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());

-- -------------------------------------------------------- the menu, live
-- Switching a dish off must take it off every open menu at once, not at the
-- guest's next reload. Any change to what the menu is made of sends a bare
-- "changed" on the public `menu` broadcast topic; open menus and carts refetch
-- get_menu() when they hear it. The message carries nothing -- not the dish,
-- not the kitchen -- so listening to it reveals nothing get_menu() does not.
--
-- Guarded, because a menu edit must never fail just because Realtime is
-- unavailable: the guest's next fetch (and place_order) still tell the truth.
create or replace function public.menu_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
    begin
      perform realtime.send(jsonb_build_object('at', now()), 'changed', 'menu', false);
    exception when others then
      raise warning 'menu broadcast failed: %', sqlerrm;
    end;
  end if;
  return null;
end $$;

revoke all on function public.menu_changed() from public, anon, authenticated;

drop trigger if exists menu_items_changed on public.menu_items;
create trigger menu_items_changed
  after insert or update or delete on public.menu_items
  for each statement execute function public.menu_changed();

drop trigger if exists categories_changed on public.categories;
create trigger categories_changed
  after insert or update or delete on public.categories
  for each statement execute function public.menu_changed();

drop trigger if exists kitchens_changed on public.kitchens;
create trigger kitchens_changed
  after update on public.kitchens
  for each statement execute function public.menu_changed();

-- -------------------------------------------------- switched off means gone
-- Until now a dish switched off stayed on the menu, greyed out. Switched off
-- now means removed: it is not returned at all. A dish outside its hours, or
-- whose kitchen is closed right now, is still returned greyed out, because it
-- will be back. A kitchen switched off entirely takes its dishes with it.
--
-- Same columns as 0010, so this replaces rather than overloads.
create or replace function public.get_menu()
returns table (
  id                text,
  category_id       text,
  category_slug     text,
  category_name     text,
  name              text,
  description       text,
  price_paise       int,
  ingredients       text,
  cooking_time_mins int,
  is_sattvic        boolean,
  is_spicy          boolean,
  is_loved          boolean,
  image_url         text,
  is_available_now  boolean,
  meal_time         text,
  meal_label        text,
  meal_starts_at    time,
  meal_ends_at      time,
  sort_order        int,
  category_sort     int
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.category_id, c.slug, c.name, m.name, m.description,
         m.price_paise, m.ingredients, m.cooking_time_mins,
         m.is_sattvic, m.is_spicy, m.is_loved, m.image_url,
         public.dish_is_on(m.meal_time,
                           coalesce(m.meal_starts_at, w.starts_at),
                           coalesce(m.meal_ends_at,   w.ends_at),
                           k.opens_at, k.closes_at, k.is_sunday_off),
         m.meal_time, coalesce(w.label, 'All day'),
         coalesce(m.meal_starts_at, w.starts_at),
         coalesce(m.meal_ends_at,   w.ends_at),
         m.sort_order, c.sort_order
    from public.menu_items m
    join public.categories c on c.id = m.category_id
    join public.kitchens   k on k.id = m.kitchen_id
    left join public.meal_windows w on w.slot = m.meal_time
   where c.is_active
     and m.is_available
     and k.is_active
   order by c.sort_order, m.sort_order, m.name;
$$;

revoke all on function public.get_menu() from public;
grant execute on function public.get_menu() to anon, authenticated;

-- ---------------------------------------------------------------- self-check
do $$
begin
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name in ('admin_roles', 'is_admin', 'is_super_admin', 'admin_whoami')
       and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'an admin role check is callable without signing in';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_name = 'menu_changed'
       and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'menu_changed is callable from the browser';
  end if;
end $$;

commit;
