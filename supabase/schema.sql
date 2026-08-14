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
--  Upgrades for databases created by an earlier version of this
--  file. "create table if not exists" above does nothing when the
--  table already exists, so new columns must be added explicitly.
--  All of these are no-ops on a fresh database.
-- =============================================================
alter table public.quotes add column if not exists "requestId"   text;
alter table public.quotes add column if not exists "actualFile"  text;
alter table public.quotes add column if not exists "actualGrams" numeric;
alter table public.quotes add column if not exists "actualHours" numeric;
alter table public.quotes add column if not exists "actualCost"  numeric;
alter table public.quotes add column if not exists "actualPrice" numeric;
alter table public.quotes add column if not exists "actualAt"    timestamptz;
alter table public.quotes add column if not exists "actualNote"  text;

alter table public.requests add column if not exists "estPriceHigh" numeric;
alter table public.requests add column if not exists "priceBand"    text;

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
-- =====================================================================
-- Axis3D — fold the live migrations back into schema.sql
--
-- These two changes were applied directly to the database and are NOT in
-- supabase/schema.sql. Re-running schema.sql today would RE-CREATE the
-- world-readable products policy and silently undo draft protection.
--
-- Paste this into supabase/schema.sql, after the products table block and
-- after the existing products policies. Idempotent — safe to re-run.
-- =====================================================================

-- ---------- products: pipeline columns ----------
alter table public.products add column if not exists status         text not null default 'published';
alter table public.products add column if not exists dimensions_mm  text;
alter table public.products add column if not exists color_count    integer;
alter table public.products add column if not exists print_time_s   integer;
alter table public.products add column if not exists layer_height   numeric;
alter table public.products add column if not exists printer        text;
alter table public.products add column if not exists print_profile  text;
alter table public.products add column if not exists materials      text;
alter table public.products add column if not exists images         jsonb;
alter table public.products add column if not exists spec           jsonb;
alter table public.products add column if not exists updated_at     timestamptz default now();

-- Existing databases created before `status` existed: the column default only
-- applies to new rows, so make sure nothing is left null.
update public.products set status = 'published' where status is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_status_check') then
    alter table public.products
      add constraint products_status_check
      check (status in ('draft', 'published', 'archived'));
  end if;
end $$;

create index if not exists products_status_idx on public.products (status);

-- ---------- products: draft-aware read policy ----------
-- Replaces "products readable by all". The public catalog sees published rows
-- only; signed-in owners see everything, which is why admin shows drafts.
drop policy if exists "products readable by all" on public.products;

drop policy if exists "published products readable by all" on public.products;
create policy "published products readable by all"
  on public.products for select
  to public
  using (status = 'published');

drop policy if exists "all products readable when signed in" on public.products;
create policy "all products readable when signed in"
  on public.products for select
  to authenticated
  using (true);

-- ---------- storage: public product images ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-images', 'product-images', true, 26214400)
on conflict (id) do update set public = true;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read"
  on storage.objects for select
  to public
  using (bucket_id = 'product-images');

-- ---------- filaments (colour catalogue + shelf stock) ----------
create table if not exists public.filaments (
  id             text primary key,
  name           text not null,
  material       text not null default 'PLA',
  hex            text not null,
  brand          text,
  in_stock       boolean not null default true,
  lead_days_min  integer not null default 2,
  lead_days_max  integer not null default 5,
  sort           integer not null default 100,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table public.products add column if not exists slots jsonb;

alter table public.filaments enable row level security;

drop policy if exists "filaments readable by all" on public.filaments;
create policy "filaments readable by all"
  on public.filaments for select to public using (true);

drop policy if exists "owner manages filaments" on public.filaments;
create policy "owner manages filaments"
  on public.filaments for all to authenticated using (true) with check (true);

create index if not exists filaments_stock_idx on public.filaments (in_stock, sort);

-- Public category taxonomy. Edit it in Shop tools -> Catalog -> Categories.
insert into public.settings (key, value, is_public) values
  ('categories', '[
     {"id":"games","name":"Games","blurb":"Trackers, dice towers, tabletop bits.","visible":true},
     {"id":"gifts","name":"Gifts","blurb":"Keepsakes, toppers, one-off presents.","visible":true},
     {"id":"props","name":"Props","blurb":"Wands, replicas, costume pieces.","visible":true},
     {"id":"signs","name":"Signs & Lettering","blurb":"Names, initials, door signs, word art.","visible":true},
     {"id":"cards","name":"Cards & Wallets","blurb":"Tap-to-pay holders and card caddies.","visible":true},
     {"id":"toys","name":"Toys, Figures & Art","blurb":"Fidgets, articulated prints, desk pieces.","visible":true},
     {"id":"storage","name":"Storage & Organization","blurb":"Bins, drawer inserts, gridfinity, trays.","visible":true},
     {"id":"desk","name":"Desk & Organizer","blurb":"Stands, hooks, cable management.","visible":true},
     {"id":"home","name":"Home & Decor","blurb":"Planters, hooks, things around the house.","visible":true},
     {"id":"kitchen","name":"Kitchen","blurb":"Food-safe PETG cutters and gadgets.","visible":true},
     {"id":"printer","name":"3D Printer Gear","blurb":"Toolbox inserts, spool clips, printer mods.","visible":true},
     {"id":"tools","name":"Shop & Tools","blurb":"Jigs, trays, workshop fixtures.","visible":true}
   ]'::jsonb, true)
on conflict (key) do nothing;
