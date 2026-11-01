-- ============================================================================
-- Lakwa Burger Cafe — full schema
-- Run once in Supabase → SQL Editor (or `supabase db push`).
--
-- Security model: the browser only ever uses the anon key, which can READ the
-- menu and settings and nothing else. Every order, customer, payment and staff
-- operation runs on the Next.js server with the service-role key.
-- ============================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- settings
-- Single row (id = 1). Editable from /staff/settings.
create table if not exists public.settings (
  id              int primary key default 1 check (id = 1),
  markup_pct      numeric(5,2) not null default 20,   -- public price = base × (1 + markup)
  gcash_name      text not null default 'LAKWA MOTORCYCLES',
  gcash_number    text not null default '0931 154 9766',
  gcash_qr_url    text,                               -- optional QR image URL
  accepting_orders boolean not null default true,
  updated_at      timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------- menu
-- base_price = the price before the increase (what registered customers pay).
create table if not exists public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  description  text not null default '',
  base_price   numeric(10,2) not null check (base_price >= 0),
  image_url    text,
  category     text not null default 'Burgers',
  sort_order   int  not null default 0,
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists menu_items_sort_idx on public.menu_items (sort_order);
drop trigger if exists menu_items_updated_at on public.menu_items;
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- staff
-- A staff member is a Supabase Auth user with a row here.
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- registered customers
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  email               citext unique not null,
  full_name           text not null,
  phone               text,
  passcode_hash       text not null,                  -- bcrypt; plain passcode is only emailed
  extra_discount_pct  numeric(5,2) not null default 0 check (extra_discount_pct between 0 and 100),
  is_active           boolean not null default true,
  notes               text,
  failed_attempts     int not null default 0,
  locked_until        timestamptz,
  passcode_sent_at    timestamptz,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- orders
create sequence if not exists public.order_no_seq start 1001;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text unique not null default ('LBC-' || nextval('public.order_no_seq')),
  access_token    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  customer_id     uuid references public.customers(id) on delete set null,
  is_member       boolean not null default false,
  customer_name   text not null,
  email           citext not null,
  phone           text not null,
  fulfillment     text not null check (fulfillment in ('dine_in','pickup','ride_thru')),
  notes           text,
  subtotal        numeric(10,2) not null,   -- at public (increased) prices
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null,
  markup_pct      numeric(5,2) not null,    -- snapshot
  status          text not null default 'awaiting_payment'
                  check (status in ('awaiting_payment','payment_submitted','paid','preparing','ready','completed','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_email_idx on public.orders (email);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  menu_item_id      uuid references public.menu_items(id) on delete set null,
  name              text not null,
  qty               int not null check (qty between 1 and 50),
  unit_price        numeric(10,2) not null,  -- public price at time of order
  charged_unit_price numeric(10,2) not null, -- what this customer actually paid per unit
  line_total        numeric(10,2) not null
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- payments (GCash proof)
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  method        text not null default 'gcash',
  gcash_ref     text not null,               -- 13-digit GCash reference no. (digits only)
  amount        numeric(10,2) not null,
  sender_name   text,
  sender_number text,
  proof_path    text not null,               -- path in the private "payment-proofs" bucket
  status        text not null default 'submitted' check (status in ('submitted','verified','rejected')),
  review_note   text,
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists payments_order_idx on public.payments (order_id);
-- The same GCash reference can never be accepted twice.
create unique index if not exists payments_ref_unique
  on public.payments (gcash_ref) where status <> 'rejected';

-- ---------------------------------------------------------------- RLS
alter table public.settings     enable row level security;
alter table public.menu_items   enable row level security;
alter table public.staff        enable row level security;
alter table public.customers    enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.payments     enable row level security;

drop policy if exists "Public read menu" on public.menu_items;
create policy "Public read menu" on public.menu_items
  for select to anon, authenticated using (is_available = true);

drop policy if exists "Public read settings" on public.settings;
create policy "Public read settings" on public.settings
  for select to anon, authenticated using (true);

-- Staff can read their own staff row (used to check access after login).
drop policy if exists "Staff read self" on public.staff;
create policy "Staff read self" on public.staff
  for select to authenticated using (user_id = auth.uid());

-- No other policies: customers, orders, order_items and payments are only
-- reachable through the server (service role bypasses RLS).

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 6291456,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;
