-- =============================================================================
-- 0026 — "Goes well with this" comes from the kitchens already cooking
--
-- The cart suggested the first few dishes on the menu, whoever cooks them. A
-- suggestion from another kitchen splits the order across one more kitchen and
-- one more pickup for the rider, so suggestions now come only from the
-- kitchens that already cook something in the cart, and only dishes that can
-- be ordered right now.
--
-- The browser never learns which kitchen cooks a dish (get_menu leaves
-- kitchen_id out on purpose), so the choice is made here and only dish ids go
-- back -- never a kitchen.
--
-- Order: dishes from a category the cart does not have yet come first, one per
-- category before any second, most loved first -- a curry in the cart brings
-- up a bread or a rice, not another curry.
-- =============================================================================

begin;

create or replace function public.get_pairings(p_item_ids text[], p_limit int default 4)
returns table (id text)
language sql
security definer
set search_path = public
stable
as $$
  with cart as (
    select m.kitchen_id, m.category_id
      from public.menu_items m
     where m.id = any (p_item_ids[1:50])
  ),
  pool as (
    select g.id, g.category_id, g.is_loved, g.category_sort, g.sort_order, g.name,
           g.category_id in (select c.category_id from cart c) as same_category
      from public.get_menu() g
      join public.menu_items m on m.id = g.id
     where g.is_available_now
       and not (g.id = any (p_item_ids))
       and m.kitchen_id in (select c.kitchen_id from cart c)
  ),
  ranked as (
    select p.*,
           row_number() over (partition by p.category_id
                              order by p.is_loved desc, p.sort_order, p.name) as nth
      from pool p
  )
  select r.id
    from ranked r
   order by r.same_category, r.nth, r.is_loved desc, r.category_sort, r.sort_order, r.name
   limit least(greatest(coalesce(p_limit, 4), 1), 8);
$$;

revoke all on function public.get_pairings(text[], int) from public;
grant execute on function public.get_pairings(text[], int) to anon, authenticated;

-- ---------------------------------------------------------------- self-check
-- Every suggestion for a dish must come from that dish's own kitchen, and the
-- dish itself is never suggested back.
do $$
declare
  v_dish    record;
  v_bad     int;
begin
  select m.id, m.kitchen_id into v_dish
    from public.menu_items m
    join public.get_menu() g on g.id = m.id
   limit 1;
  if not found then
    raise notice 'no dishes on the menu; get_pairings not exercised';
    return;
  end if;

  select count(*) into v_bad
    from public.get_pairings(array[v_dish.id], 8) p
    join public.menu_items m on m.id = p.id
   where m.kitchen_id <> v_dish.kitchen_id or p.id = v_dish.id;
  if v_bad > 0 then
    raise exception 'get_pairings suggested % dish(es) from another kitchen or the dish itself', v_bad;
  end if;

  raise notice 'get_pairings keeps to the cart''s kitchens';
end $$;

commit;
