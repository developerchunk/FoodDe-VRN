-- =============================================================================
-- 0022 — "Custom timing" as a meal time of its own
--
-- A dish served 13:00-15:00 is not really Lunch with an override; it has its
-- own hours. So instead of picking a slot and then overriding it, the admin
-- picks Custom timing and gives the hours. A custom dish without both hours
-- would have no window at all, so the database refuses one.
--
-- Nothing else changes: dish_is_on already measures a dish against its own
-- start and end when they are set, whatever the slot is called.
-- =============================================================================

begin;

insert into public.meal_windows (slot, label, starts_at, ends_at, sort_order)
values ('custom', 'Custom timing', null, null, 99)
on conflict (slot) do nothing;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_custom_has_window') then
    alter table public.menu_items
      add constraint menu_items_custom_has_window
      check (meal_time <> 'custom' or (meal_starts_at is not null and meal_ends_at is not null));
  end if;
end $$;

commit;
