-- =============================================================================
-- 0030 — a picture for each category
--
-- The phone menu's category strip pictured each category with one of its own
-- dishes. The admin now chooses the picture: categories get an image_url, set
-- on the Categories page, and get_menu hands it out. A category without one
-- still falls back to a dish photo in the browser.
--
-- The photo lives in the same public `menu-images` bucket as dish photos,
-- under categories/, and is made small on the admin's device the same way.
-- Admins can already write categories (0018), and a change already tells every
-- open menu to refetch (categories_changed).
-- =============================================================================

begin;

alter table public.categories add column if not exists image_url text;

-- get_menu gains a column, and `create or replace` cannot change a function's
-- return type, so it is dropped and created again -- exactly 0018's body plus
-- the category picture. get_pairings (0026) reads it by column name and is
-- unaffected.
drop function if exists public.get_menu();

create function public.get_menu()
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
  category_sort     int,
  category_image_url text
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
         m.sort_order, c.sort_order, c.image_url
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

commit;
