-- Snapshot of tracked, active Shopify product-variant inventory, refreshed by
-- the Shopify puller. Only inventory-tracked variants on active products are
-- stored (untracked items like package-protection apps are excluded). The table
-- is fully replaced each run, so it always reflects current on-hand levels.

create table if not exists public.shopify_inventory (
  variant_id text primary key,
  sku text,
  product_title text not null,
  variant_title text,
  inventory_quantity integer not null default 0,
  synced_at timestamptz not null default now()
);

-- Lowest stock first — the natural query for low-stock / oversold alerts.
create index if not exists shopify_inventory_qty_idx
  on public.shopify_inventory (inventory_quantity);

alter table public.shopify_inventory enable row level security;

-- Mirrored connector data: authenticated reads only; the service-role puller
-- writes (service role bypasses RLS), matching the other mirrored tables.
create policy "auth read"
  on public.shopify_inventory for select
  to authenticated
  using (true);
