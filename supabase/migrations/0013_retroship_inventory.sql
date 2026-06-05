-- Snapshot of Retroship (3PL/WMS) inventory, refreshed daily from the Retroship
-- inventory export (API puller or parsed daily email). This is the warehouse
-- source of truth for on-hand, used to reconcile against shopify_inventory and
-- to compute days-of-cover / available-to-promise. Like shopify_inventory, the
-- table is fully replaced each run so it always reflects the latest snapshot.
--
-- Columns beyond sku/warehouse/on_hand are nullable: Retroship may not report
-- available/allocated/in_transit, so the intelligence layer treats them as
-- optional and falls back to on_hand when absent.

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

-- Lowest available (falling back to on_hand) first — the natural query for
-- stockout-risk and reconciliation sweeps.
create index if not exists retroship_inventory_onhand_idx
  on public.retroship_inventory (on_hand);

create index if not exists retroship_inventory_sku_idx
  on public.retroship_inventory (sku);

alter table public.retroship_inventory enable row level security;

-- Mirrored connector data: authenticated reads only; the service-role puller
-- writes (service role bypasses RLS), matching shopify_inventory and the other
-- mirrored tables.
create policy "auth read"
  on public.retroship_inventory for select
  to authenticated
  using (true);
