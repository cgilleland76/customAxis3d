-- =============================================================
--  AXIS3D site — Supabase schema
--  Run this once in Supabase → SQL Editor → New query → Run.
--
--  Security model
--  --------------
--  * anyone (anon key, i.e. a website visitor) may INSERT a
--    request — that's how customers send you things.
--  * NOBODY anonymous may SELECT requests or quotes. Customer
--    names, phone numbers and photos are not public.
--  * you read them by signing in on /admin with a Supabase user
--    (Authentication → Users → Add user). That's what makes the
--    "authenticated" policies below apply to you.
--  * products are world-readable (they're your public catalog)
--    and only writable when signed in.
-- =============================================================

-- ---------- products (public catalog) ----------
create table if not exists public.products (
  id         text primary key,
  name       text not null,
  category   text,
  blurb      text,
  price      numeric default 0,
  grams      numeric default 0,
  hours      numeric default 0,
  img        text,
  batch      boolean default true,
  tags       text,
  created_at timestamptz default now()
);

-- ---------- requests (custom configs, ideas, order lists) ----------
create table if not exists public.requests (
  id                 text primary key,
  created_at         timestamptz default now(),
  status             text default 'new',      -- new | working | done
  kind               text,                    -- 'Order list' | 'Idea request' | 'Custom design'
  source             text,                    -- which page it came from
  name               text,
  contact            text,
  due                text,
  qty                integer default 1,
  notes              text,

  -- configurator
  type               text,
  "typeLabel"        text,
  config             jsonb,
  summary            text,
  material           text,
  colors             jsonb,
  "estGrams"         numeric,
  "estHours"         numeric,
  "estPrice"         numeric,
  svg                text,

  -- idea modeler
  "desc"             text,
  cat                text,
  purpose            text,
  dims               jsonb,
  env                jsonb,
  feat               jsonb,
  budget             text,
  mustfit            text,
  refs               jsonb,
  prompt             text,
  "suggestedMaterial" text,
  "printSetup"       text,
  concept            text,

  -- order list
  items              jsonb,
  "estTotal"         numeric,
  text               text
);

-- "desc" is quoted everywhere because DESC is a SQL keyword.
create index if not exists requests_created_idx on public.requests (created_at desc);
create index if not exists requests_status_idx  on public.requests (status);

-- ---------- settings (rates are private, price bands are public) ----------
-- One table, one visibility flag. Anything with is_public = false is
-- unreadable without your login — that is what keeps your filament cost,
-- markup multiplier and hourly rate off the public site.
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  is_public  boolean not null default false,
  updated_at timestamptz default now()
);

-- ---------- quotes (from sliced files) ----------
create table if not exists public.quotes (
  id            text primary key,
  created_at    timestamptz default now(),
  date          text,
  name          text,
  file          text,
  grams         numeric,
  hours         numeric,
  "filCost"     numeric,
  "elecCost"    numeric,
  flat          numeric,
  cost          numeric,
  "priceMarkup" numeric,
  "priceHourly" numeric,
  rates         jsonb,

  -- job costing: what it actually took, filled in after the print
  "requestId"     text,
  "actualFile"    text,
  "actualGrams"   numeric,
  "actualHours"   numeric,
  "actualCost"    numeric,
  "actualPrice"   numeric,
  "actualAt"      timestamptz,
  "actualNote"    text
);

-- =============================================================
--  Row Level Security
-- =============================================================
alter table public.products enable row level security;
alter table public.requests enable row level security;
alter table public.quotes   enable row level security;
alter table public.settings enable row level security;

-- products: world-readable, owner-writable
drop policy if exists "products readable by all" on public.products;
create policy "products readable by all"
  on public.products for select
  using (true);

drop policy if exists "products writable when signed in" on public.products;
create policy "products writable when signed in"
  on public.products for all
  to authenticated
  using (true) with check (true);

-- settings: the public site may read ONLY rows flagged public (price bands).
-- Shop rates live in this same table with is_public = false and are invisible
-- to anyone who is not signed in.
drop policy if exists "public settings readable" on public.settings;
create policy "public settings readable"
  on public.settings for select
  to anon
  using (is_public = true);

drop policy if exists "owner manages settings" on public.settings;
create policy "owner manages settings"
  on public.settings for all
  to authenticated
  using (true) with check (true);

-- requests: anyone may submit, only you may read/modify
drop policy if exists "anyone may submit a request" on public.requests;
create policy "anyone may submit a request"
  on public.requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "owner reads requests" on public.requests;
create policy "owner reads requests"
  on public.requests for select
  to authenticated
  using (true);

drop policy if exists "owner updates requests" on public.requests;
create policy "owner updates requests"
  on public.requests for update
  to authenticated
  using (true) with check (true);

drop policy if exists "owner deletes requests" on public.requests;
create policy "owner deletes requests"
  on public.requests for delete
  to authenticated
  using (true);

-- Lets the setup wizard clean up after its own connection test while you are
-- still signed out. It can only ever touch rows whose id starts with 'probe-',
-- which nothing else creates.
drop policy if exists "setup probe cleanup" on public.requests;
create policy "setup probe cleanup"
  on public.requests for delete
  to anon
  using (id like 'probe-%');

-- quotes: the public quote page may write one (a visitor pricing their own
-- file), but only you can read, edit or delete them.
drop policy if exists "owner manages quotes" on public.quotes;

drop policy if exists "anyone may save a quote" on public.quotes;
create policy "anyone may save a quote"
  on public.quotes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "owner reads quotes" on public.quotes;
create policy "owner reads quotes"
  on public.quotes for select
  to authenticated
  using (true);

drop policy if exists "owner updates quotes" on public.quotes;
create policy "owner updates quotes"
  on public.quotes for update
  to authenticated
  using (true) with check (true);

drop policy if exists "owner deletes quotes" on public.quotes;
create policy "owner deletes quotes"
  on public.quotes for delete
  to authenticated
  using (true);

-- =============================================================
--  Optional: seed the catalog with a couple of rows so the
--  public site has something in it before you add photos.
-- =============================================================
insert into public.products (id, name, category, blurb, price, grams, hours, batch, tags) values
  ('p-articulated-dragon','Articulated Dragon','Toys & Fidget','Print-in-place, 40+ moving segments.',18,46,3.2,true,'bestseller'),
  ('p-phone-stand','Adjustable Phone Stand','Desk & Organizer','Two viewing angles, cable pass-through.',12,34,1.8,true,'bestseller'),
  ('p-cable-clips','Cable Clips (set of 6)','Desk & Organizer','Adhesive-backed cord management.',6,12,0.7,true,'quick')
on conflict (id) do nothing;

-- Public, already-marked-up price bands for the configurator. These are
-- PRICES, not costs — safe to expose. Edit them in Shop tools -> Pricing.
insert into public.settings (key, value, is_public) values
  ('priceBands', '[
     {"maxIn": 4,  "label": "Up to 4 in",  "low": 10, "high": 16},
     {"maxIn": 6,  "label": "4 to 6 in",   "low": 16, "high": 26},
     {"maxIn": 9,  "label": "6 to 9 in",   "low": 26, "high": 45},
     {"maxIn": 12, "label": "9 to 12 in",  "low": 45, "high": 75},
     {"maxIn": 999,"label": "Over 12 in",  "low": 75, "high": 140}
   ]'::jsonb, true)
on conflict (key) do nothing;
