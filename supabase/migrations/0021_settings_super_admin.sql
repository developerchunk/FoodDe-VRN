-- =============================================================================
-- 0021 — settings belong to the super admin
--
-- The alerts number decides who hears when an order is stuck. That is the
-- owner's call, not day-to-day data entry, so the settings page moved from the
-- admin's menu to the super admin's, and the database follows: only a super
-- admin may read or change `settings`. The edge functions read it with the
-- secret key and are unaffected.
-- =============================================================================

begin;

drop policy if exists settings_admin_read  on public.settings;
drop policy if exists settings_admin_write on public.settings;
drop policy if exists settings_super_read  on public.settings;
drop policy if exists settings_super_write on public.settings;

create policy settings_super_read on public.settings
  for select to authenticated using ((select public.is_super_admin()));
create policy settings_super_write on public.settings
  for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

commit;
