-- The example coupons seeded in 0006 go; the mechanism stays.
--
-- RADHE50, FIRSTMEAL and SATTVIC20 were invented to have something to show. Real
-- offers will be created in this table, so nothing here touches the coupons
-- table, get_coupons() or the discount rule inside price_order() -- only the
-- three made-up rows.
--
-- Guarded rather than unconditional: orders.coupon_code is plain text with no
-- foreign key, so deleting a code an order was actually priced with would leave
-- that order pointing at a coupon nobody can look up. None do today; this keeps
-- it true if the migration is ever re-run against a database where one does.
delete from public.coupons c
 where c.code in ('RADHE50', 'FIRSTMEAL', 'SATTVIC20')
   and not exists (
     select 1 from public.orders o where o.coupon_code = c.code
   );

-- The mechanism must survive this, or a later "add our real coupons" lands on
-- something that no longer works.
do $$
declare
  v_left int;
begin
  if to_regclass('public.coupons') is null then
    raise exception 'the coupons table is gone';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_coupons'
  ) then
    raise exception 'get_coupons() is gone';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'price_order'
  ) then
    raise exception 'price_order() is gone';
  end if;

  select count(*) into v_left
    from public.coupons
   where code in ('RADHE50', 'FIRSTMEAL', 'SATTVIC20');
  raise notice 'seeded coupons remaining: % (0 unless one was used by an order)', v_left;
end $$;
