-- ============================================================
-- Project Hail Mary — Pseudo POS for CaratLane US Stores
-- Run this in Supabase SQL Editor for the new hail-mary project
-- ============================================================

-- Products (loaded from SKu and Barcode Data.xls, sheet 2)
create table if not exists products (
  id            uuid default gen_random_uuid() primary key,
  sku           text unique not null,
  display_name  text,                -- derived: metal + jewellery_type
  weight        decimal,
  price         decimal,             -- original price (strike-through on PDP)
  special_price decimal,             -- selling price
  size          text,
  metal         text,
  diamond       text,
  jewellery_type text,
  gender        text,
  gemstone      text,
  metal_weight1 decimal,
  diamond_pieces int,
  diamond_weight decimal,
  created_at    timestamptz default now()
);

-- Barcodes (loaded from SKu and Barcode Data.xls, sheet 1)
-- Each row = one physical piece of jewelry in store inventory
create table if not exists barcodes (
  id           uuid default gen_random_uuid() primary key,
  barcode      text unique not null,
  sku          text not null,
  store_slug   text not null default 'dallas',
  status       text default 'available' check (status in ('available', 'sold')),
  sold_order_no text,
  created_at   timestamptz default now()
);

-- Orders
create table if not exists hm_orders (
  id                    uuid default gen_random_uuid() primary key,
  order_no              text unique not null,  -- HM-YYYYMMDD-NNNN
  store_slug            text not null,
  store_name            text not null,
  consultant_id         text not null,
  -- Customer
  customer_first_name   text not null,
  customer_last_name    text not null,
  customer_email        text not null,
  customer_phone        text not null,
  customer_zip          text,
  -- Financials
  items_subtotal        decimal not null,
  birthday_discount     decimal default 0,
  anniversary_discount  decimal default 0,
  post_discount_subtotal decimal not null,
  gold_coins_count      int default 0,
  gold_coin_value       decimal default 0,
  tax_rate              decimal not null,
  tax_amount            decimal not null,
  invoice_total         decimal not null,
  -- Payment
  payment_method        text not null check (payment_method in ('cash', 'card')),
  payment_ref           text,
  -- Meta
  status                text default 'confirmed',
  birthday_date         text,
  anniversary_date      text,
  created_at            timestamptz default now()
);

-- Order line items
create table if not exists hm_order_items (
  id           uuid default gen_random_uuid() primary key,
  order_id     uuid references hm_orders(id),
  sku          text not null,
  barcode      text,
  display_name text not null,
  qty          int default 1,
  unit_price   decimal not null,
  amount       decimal not null,
  is_gold_coin boolean default false,
  is_free      boolean default false
);

-- RLS
alter table products       enable row level security;
alter table barcodes       enable row level security;
alter table hm_orders      enable row level security;
alter table hm_order_items enable row level security;

create policy "public_read_products"    on products       for select using (true);
create policy "public_insert_products"  on products       for insert with check (true);

create policy "public_read_barcodes"    on barcodes       for select using (true);
create policy "public_insert_barcodes"  on barcodes       for insert with check (true);
create policy "public_update_barcodes"  on barcodes       for update using (true);

create policy "public_read_orders"      on hm_orders      for select using (true);
create policy "public_write_orders"     on hm_orders      for insert with check (true);

create policy "public_read_items"       on hm_order_items for select using (true);
create policy "public_write_items"      on hm_order_items for insert with check (true);

-- Seed: Gold coin product
insert into products (sku, display_name, price, special_price, jewellery_type, weight)
values ('GGC00117-YE00-000000000-00_0000', '0.20g Gold Coin', 40, 40, 'Gold Coin', 0.20)
on conflict (sku) do nothing;
