-- =============================================================================
-- 0003 — one key format everywhere, and kitchen hours drive the menu
--
-- Two changes:
--
--  1. addresses, kitchens and menu_items all key on the same opaque 10-character
--     code. The kitchen sheet already uses it (83jdlpw78k), so this makes the
--     database agree with the spreadsheets rather than the other way round.
--
--  2. A dish is only orderable while the kitchen that cooks it is open.
--
-- The second one forces an architecture change. Computing "is this kitchen open"
-- inside a security_invoker view would require the *caller* to hold SELECT on
-- `kitchens` — which is where the WhatsApp numbers live. So the menu becomes a
-- SECURITY DEFINER function instead: it reads kitchens internally and returns a
-- plain boolean, never the kitchen id and never the hours.
--
-- DESTRUCTIVE. Safe only because no orders exist yet. The one imported address
-- is carried across keyed on its printed QR code, so stickers already on a wall
-- keep working.
-- =============================================================================

begin;

drop view     if exists public.public_menu;
drop function if exists public.resolve_address(text);
drop function if exists public.get_receipt(uuid);

-- Dependents first. All of these are empty, so there is nothing to preserve.
drop table if exists public.message_log       cascade;
drop table if exists public.delivery_partners cascade;
drop table if exists public.order_tickets     cascade;
drop table if exists public.order_items       cascade;
drop table if exists public.orders            cascade;
drop table if exists public.menu_items        cascade;
drop table if exists public.categories        cascade;
drop table if exists public.kitchens          cascade;

-- A 10-character code from an alphabet with no vowels and no 0/O/1/l, so it
-- cannot spell anything and can be read aloud over a phone.
create or replace function public.new_code()
returns text language sql volatile as $$
  select string_agg(
           substr('23456789bcdfghjkmnpqrstvwxyz',
                  (floor(random() * 28) + 1)::int, 1), '')
    from generate_series(1, 10);
$$;

-- ----------------------------------------------------------------- addresses
-- Converted in place rather than copied through a scratch table: the printed
-- QR code becomes the primary key, so a sticker already on a wall keeps
-- resolving. `using public_code` reads the value out of the old column before
-- it is dropped.
alter table public.addresses drop constraint if exists addresses_pkey;
alter table public.addresses alter column id drop identity if exists;
alter table public.addresses alter column id type text using public_code;
alter table public.addresses alter column id set default public.new_code();
alter table public.addresses add primary key (id);
alter table public.addresses drop column public_code;

-- ------------------------------------------------------------------ kitchens
create table public.kitchens (
  id               text primary key default public.new_code(),
  place_name       text not null,
  owner_name       text,
  address          text,
  area             text,
  pin_code         text,
  city             text not null default 'Vrindavan',
  latitude         numeric(9, 6),
  longitude        numeric(9, 6),
  whatsapp_number  text not null,
  opens_at         time,
  closes_at        time,
  is_sunday_off    boolean not null default false,
  fssai_license    text,
  gst_number       text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.delivery_partners (
  id               text primary key default public.new_code(),
  name             text not null,
  whatsapp_number  text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------------ the menu
create table public.categories (
  id          text primary key default public.new_code(),
  slug        text not null unique,
  name        text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true
);

create table public.menu_items (
  id                text primary key default public.new_code(),
  kitchen_id        text not null references public.kitchens (id),
  category_id       text not null references public.categories (id),
  name              text not null,
  description       text,
  price_paise       int  not null check (price_paise > 0),
  ingredients       text,
  cooking_time_mins int,
  is_sattvic        boolean not null default true,
  is_spicy          boolean not null default false,
  is_loved          boolean not null default false,
  image_url         text,
  is_available      boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);
create index menu_items_category_idx on public.menu_items (category_id);
create index menu_items_kitchen_idx  on public.menu_items (kitchen_id);

-- -------------------------------------------------------------------- orders
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            text not null unique,
  receipt_token       uuid not null default gen_random_uuid(),
  address_id          text not null references public.addresses (id),
  guest_user_id       uuid references auth.users (id),
  guest_name          text not null,
  guest_phone         text not null,
  guest_email         text,
  status              public.order_status not null default 'pending_payment',
  subtotal_paise      int not null,
  delivery_paise      int not null default 0,
  packing_paise       int not null default 0,
  tax_paise           int not null default 0,
  total_paise         int not null,
  note                text,
  razorpay_order_id   text,
  razorpay_payment_id text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index orders_guest_idx   on public.orders (guest_user_id);
create index orders_receipt_idx on public.orders (receipt_token);

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  menu_item_id      text references public.menu_items (id),
  kitchen_id        text not null references public.kitchens (id),
  name_snapshot     text not null,
  unit_price_paise  int  not null,
  qty               int  not null check (qty > 0),
  line_total_paise  int  not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_tickets (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  kitchen_id  text not null references public.kitchens (id),
  status      text not null default 'pending',
  accepted_at timestamptz,
  ready_at    timestamptz,
  created_at  timestamptz not null default now(),
  unique (order_id, kitchen_id)
);

create table public.message_log (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders (id) on delete cascade,
  recipient_type      text not null check (recipient_type in ('kitchen','delivery','property')),
  recipient_number    text not null,
  template            text,
  payload             jsonb,
  status              text not null default 'queued',
  provider_message_id text,
  error               text,
  attempts            int not null default 0,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index message_log_order_idx on public.message_log (order_id);

-- =============================================================================
-- Nothing in public is readable from a browser. Everything a guest needs comes
-- through the three functions below.
-- =============================================================================
alter table public.addresses         enable row level security;
alter table public.kitchens          enable row level security;
alter table public.delivery_partners enable row level security;
alter table public.categories        enable row level security;
alter table public.menu_items        enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_tickets     enable row level security;
alter table public.message_log       enable row level security;

revoke all on public.menu_items from anon, authenticated;
revoke all on public.categories from anon, authenticated;

create policy orders_select_own on public.orders
  for select to authenticated
  using (guest_user_id = (select auth.uid()));

-- ------------------------------------------------------------ kitchen hours
-- Vrindavan runs on IST; the server does not. Comparing against the server
-- clock would open the kitchen five and a half hours late.
create or replace function public.kitchen_is_open(
  p_opens time, p_closes time, p_sunday_off boolean
) returns boolean
language sql stable
set search_path = public
as $$
  with now_ist as (select (now() at time zone 'Asia/Kolkata') as t)
  select case
    when p_opens is null or p_closes is null then true
    when p_sunday_off and extract(dow from (select t from now_ist)) = 0 then false
    when p_closes > p_opens
      then (select t::time from now_ist) between p_opens and p_closes
    -- a kitchen closing after midnight, e.g. 18:00-02:00
    else (select t::time from now_ist) >= p_opens
      or (select t::time from now_ist) <= p_closes
  end;
$$;

-- ------------------------------------------------------------------ the menu
-- A definer function rather than a view: it needs to read `kitchens` to know
-- whether a dish is orderable right now, and the caller must never be able to.
-- It returns a boolean, not the kitchen id and not the opening hours.
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
         (m.is_available
          and k.is_active
          and public.kitchen_is_open(k.opens_at, k.closes_at, k.is_sunday_off)),
         m.sort_order, c.sort_order
    from public.menu_items m
    join public.categories c on c.id = m.category_id
    join public.kitchens   k on k.id = m.kitchen_id
   where c.is_active
   order by c.sort_order, m.sort_order, m.name;
$$;

revoke all on function public.get_menu() from public;
grant execute on function public.get_menu() to anon, authenticated;

-- ---------------------------------------------------- resolving a QR address
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
  select a.id, a.place_name, a.room_number, a.address, a.area, a.city, a.pin_code
    from public.addresses a
   where a.id = p_code and a.is_active
   limit 1;
$$;

revoke all on function public.resolve_address(text) from public;
grant execute on function public.resolve_address(text) to anon, authenticated;

-- -------------------------------------------------------- fetching a receipt
create or replace function public.get_receipt(p_token uuid)
returns jsonb
language sql security definer set search_path = public stable
as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
    'place_name', a.place_name, 'room_number', a.room_number,
    'guest_name', o.guest_name,
    'subtotal_paise', o.subtotal_paise, 'delivery_paise', o.delivery_paise,
    'packing_paise', o.packing_paise, 'tax_paise', o.tax_paise,
    'total_paise', o.total_paise,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', i.name_snapshot, 'qty', i.qty,
               'unit_price_paise', i.unit_price_paise,
               'line_total_paise', i.line_total_paise
             ) order by i.name_snapshot), '[]'::jsonb)
        from public.order_items i where i.order_id = o.id)
  )
  from public.orders o
  join public.addresses a on a.id = o.address_id
  where o.receipt_token = p_token;
$$;

revoke all on function public.get_receipt(uuid) from public;
grant execute on function public.get_receipt(uuid) to anon, authenticated;

create or replace function public.is_permanent_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean is not true
                  and auth.uid() is not null, false);
$$;
grant execute on function public.is_permanent_user() to anon, authenticated;

commit;
