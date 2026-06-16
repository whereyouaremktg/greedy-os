-- Glow OS — ShipHero (Retroship 3PL) mirror tables.
--
-- Retroship/Ship4us runs on ShipHero. We already mirror ShipHero on-hand into
-- retroship_inventory (migration 0013). This migration adds two MORE mirror
-- snapshots so the 3PL's own view of inbound + outbound is reconcilable against
-- our OWNED intent tables — WITHOUT writing into those owned tables:
--
--   * shiphero_inbound_pos      <- ShipHero "Purchase Orders" (manufacturer ->
--                                  warehouse replenishment). Reconciled at READ
--                                  time against manufacturing_runs.
--   * shiphero_wholesale_orders <- ShipHero "Manual Orders" that carry a retailer
--                                  company (Anthropologie, Urban Outfitters, ...).
--                                  Reconciled at READ time against purchase_orders
--                                  (buyer POs) on the retailer's PO number.
--
-- Both follow the MIRRORED pattern: tenant-scoped, fully replaced each sync,
-- authenticated read-only, service-role puller writes. Created post-tenancy so
-- tenant_id is baked in from the start (PK-first, JWT-claim default, FK).

----------------------------------------------------------------------
-- shiphero_inbound_pos
----------------------------------------------------------------------
create table if not exists public.shiphero_inbound_pos (
  tenant_id uuid not null
    default (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid
    references public.organizations(id) on delete restrict,
  po_number text not null,
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
  synced_at timestamptz not null default now(),
  primary key (tenant_id, po_number)
);

create index if not exists shiphero_inbound_pos_status_idx
  on public.shiphero_inbound_pos (tenant_id, fulfillment_status);

alter table public.shiphero_inbound_pos enable row level security;

create policy "auth read"
  on public.shiphero_inbound_pos for select
  to authenticated
  using (true);

----------------------------------------------------------------------
-- shiphero_wholesale_orders
----------------------------------------------------------------------
create table if not exists public.shiphero_wholesale_orders (
  tenant_id uuid not null
    default (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid
    references public.organizations(id) on delete restrict,
  -- ShipHero order_number; for wholesale this is usually the RETAILER's own PO
  -- number (e.g. Anthropologie 0006066020) — the join key to purchase_orders.
  order_number text not null,
  order_date date,
  account text,
  contact_name text,
  fulfillment_status text,
  total_price numeric(14, 2),
  total_quantity integer not null default 0,
  -- 'wholesale' | 'gifting' | 'admin' | 'unknown' — the Manual Order channel is
  -- a mixed bag (PR/influencer seeding, replacements). See lib/pullers.
  classification text not null default 'unknown',
  line_items jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (tenant_id, order_number)
);

create index if not exists shiphero_wholesale_orders_account_idx
  on public.shiphero_wholesale_orders (tenant_id, account);

create index if not exists shiphero_wholesale_orders_class_idx
  on public.shiphero_wholesale_orders (tenant_id, classification);

alter table public.shiphero_wholesale_orders enable row level security;

create policy "auth read"
  on public.shiphero_wholesale_orders for select
  to authenticated
  using (true);
