-- Glow OS — ShipHero (Retroship 3PL) mirror tables.
--
-- Retroship/Ship4us runs on ShipHero. We mirror three views of the 3PL:
--   * on-hand            -> retroship_inventory (defined in 0013; created here
--                           too with `if not exists` because environments that
--                           never applied 0013 still need it for the puller).
--   * inbound POs        -> shiphero_inbound_pos      (manufacturer receiving)
--   * wholesale orders   -> shiphero_wholesale_orders (Manual Order channel)
--
-- SINGLE-TENANT to match the live prod baseline (no organizations table / no
-- tenant_id yet). When the tenancy migrations land, they add tenant_id to these
-- mirror tables the same way 0016 does for the others. MIRRORED pattern: fully
-- replaced each sync, authenticated read-only, service-role puller writes.

----------------------------------------------------------------------
-- retroship_inventory  (mirrors 0013; idempotent for un-migrated envs)
----------------------------------------------------------------------
create table if not exists public.retroship_inventory (
  sku text not null,
  warehouse text not null default 'default',
  product_title text,
  on_hand integer not null default 0,
  available integer,
  allocated integer,
  in_transit integer,
  synced_at timestamptz not null default now(),
  primary key (sku, warehouse)
);

create index if not exists retroship_inventory_onhand_idx
  on public.retroship_inventory (on_hand);
create index if not exists retroship_inventory_sku_idx
  on public.retroship_inventory (sku);

alter table public.retroship_inventory enable row level security;

do $$ begin
  create policy "auth read" on public.retroship_inventory
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------------
-- shiphero_inbound_pos
----------------------------------------------------------------------
create table if not exists public.shiphero_inbound_pos (
  po_number text primary key,
  po_date date,
  fulfillment_status text,
  vendor_name text,
  warehouse text,
  subtotal numeric(14, 2),
  line_count integer not null default 0,
  total_quantity integer not null default 0,
  total_received integer not null default 0,
  -- [{ sku, quantity, quantity_received }] as reported by ShipHero.
  line_items jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists shiphero_inbound_pos_status_idx
  on public.shiphero_inbound_pos (fulfillment_status);

alter table public.shiphero_inbound_pos enable row level security;

do $$ begin
  create policy "auth read" on public.shiphero_inbound_pos
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------------
-- shiphero_wholesale_orders
----------------------------------------------------------------------
create table if not exists public.shiphero_wholesale_orders (
  -- ShipHero order_number; for wholesale this is usually the RETAILER's own PO
  -- number (e.g. Anthropologie 0006066020) — the join key to purchase_orders.
  order_number text primary key,
  order_date date,
  account text,
  contact_name text,
  fulfillment_status text,
  total_price numeric(14, 2),
  total_quantity integer not null default 0,
  -- 'wholesale' | 'gifting' | 'admin' | 'unknown'.
  classification text not null default 'unknown',
  line_items jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists shiphero_wholesale_orders_account_idx
  on public.shiphero_wholesale_orders (account);
create index if not exists shiphero_wholesale_orders_class_idx
  on public.shiphero_wholesale_orders (classification);

alter table public.shiphero_wholesale_orders enable row level security;

do $$ begin
  create policy "auth read" on public.shiphero_wholesale_orders
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
