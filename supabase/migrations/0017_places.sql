-- =============================================================================
-- 0017 — a rest house is one place with many rooms
--
-- Until now `addresses` held one row per room, and every room carried its own
-- copy of the rest house's name, address, coordinates and WhatsApp number. Two
-- rooms of the same house could disagree about where that house is, and moving
-- its WhatsApp number meant editing every room.
--
-- So the house becomes a `places` row with its own id, and each room points at
-- it. The room keeps its id -- the 10-character code printed on the QR sticker
-- -- so every sticker already on a wall keeps resolving. `addresses` keeps its
-- name too: orders.address_id references it, and to the rest of the system a
-- room is still "the address the food goes to".
--
-- Nothing a guest sees changes. resolve_address() and get_receipt() return the
-- same columns as before; they now read the house's half from `places`.
-- =============================================================================

begin;

create table if not exists public.places (
  id               text primary key default public.new_code(),
  name             text not null,
  address          text not null,
  area             text,
  pin_code         text,
  city             text not null default 'Vrindavan',
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),
  -- the rest house's own WhatsApp: told about every order to one of its rooms
  whatsapp_number  text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;

alter table public.addresses
  add column if not exists place_id text references public.places (id);

-- ------------------------------------------------------------------ backfill
-- One place per distinct (name, address) among the existing rooms. Where two
-- rooms of one house disagree about the phone number, the most common wins;
-- the admin can correct it afterwards in one place instead of per room.
do $$
declare
  r record;
  v_id text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'addresses'
       and column_name = 'place_name'
  ) then
    return;  -- already split
  end if;

  for r in
    execute $q$
      select place_name, address,
             min(area)      as area,
             min(pin_code)  as pin_code,
             min(city)      as city,
             min(latitude)  as latitude,
             min(longitude) as longitude,
             mode() within group (order by phone_number) as phone_number,
             bool_or(is_active) as is_active
        from public.addresses
       where place_id is null
       group by place_name, address
    $q$
  loop
    insert into public.places
      (name, address, area, pin_code, city, latitude, longitude, whatsapp_number, is_active)
    values
      (r.place_name, r.address, r.area, r.pin_code, coalesce(r.city, 'Vrindavan'),
       r.latitude, r.longitude, r.phone_number, r.is_active)
    returning id into v_id;

    execute 'update public.addresses set place_id = $1
              where place_id is null and place_name = $2 and address = $3'
      using v_id, r.place_name, r.address;
  end loop;
end $$;

alter table public.addresses alter column place_id set not null;
create index if not exists addresses_place_idx on public.addresses (place_id);

-- A room number means something only inside its house, and twice inside one
-- house is a sticker that sends food to the wrong door.
create unique index if not exists addresses_place_room_uniq
  on public.addresses (place_id, lower(room_number));

-- --------------------------------------------- readers, moved onto `places`
-- Same columns as before, so create-or-replace replaces rather than overloads.
create or replace function public.resolve_address(p_code text)
returns table (
  address_id  text,
  place_name  text,
  room_number text,
  address     text,
  area        text,
  city        text,
  pin_code    text
)
language sql security definer set search_path = public stable
as $$
  select a.id, p.name, a.room_number, p.address, p.area, p.city, p.pin_code
    from public.addresses a
    join public.places p on p.id = a.place_id
   where a.id = p_code
     and a.is_active
     and p.is_active
   limit 1;
$$;

revoke all on function public.resolve_address(text) from public;
grant execute on function public.resolve_address(text) to anon, authenticated;

-- An order to a room must also be refused once its house is switched off.
-- place_order reads `addresses` directly, so the house's flag is enforced by
-- making an inactive house's rooms inactive too, in the same statement that
-- switches the house off.
create or replace function public.places_cascade_active()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_active is distinct from old.is_active and not new.is_active then
    update public.addresses set is_active = false where place_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists places_cascade_active on public.places;
create trigger places_cascade_active
  after update of is_active on public.places
  for each row execute function public.places_cascade_active();

-- The house's half of the receipt now comes from `places`. Otherwise this is
-- 0006's receipt exactly: same keys, same item shape.
create or replace function public.get_receipt(p_token uuid)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
    'place_name', p.name, 'room_number', a.room_number,
    'guest_name', o.guest_name, 'guest_phone', o.guest_phone,
    'note', o.note,
    'subtotal_paise', o.subtotal_paise,
    'discount_paise', o.discount_paise,
    'coupon_code',    o.coupon_code,
    'delivery_paise', o.delivery_paise,
    'packing_paise',  o.packing_paise,
    'tax_paise',      o.tax_paise,
    'total_paise',    o.total_paise,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id',   i.id,
               'name', i.name_snapshot, 'qty', i.qty,
               'unit_price_paise', i.unit_price_paise,
               'line_total_paise', i.line_total_paise
             ) order by i.name_snapshot), '[]'::jsonb)
        from public.order_items i where i.order_id = o.id)
  )
  from public.orders o
  join public.addresses a on a.id = o.address_id
  join public.places    p on p.id = a.place_id
  where o.receipt_token = p_token;
$$;

revoke all on function public.get_receipt(uuid) from public;
grant execute on function public.get_receipt(uuid) to anon, authenticated;

-- ------------------------------------------------- the copies, now redundant
alter table public.addresses
  drop column if exists place_name,
  drop column if exists address,
  drop column if exists area,
  drop column if exists pin_code,
  drop column if exists city,
  drop column if exists latitude,
  drop column if exists longitude,
  drop column if exists phone_number;

commit;
