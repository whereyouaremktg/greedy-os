-- Per-SKU monthly unit sales history, pulled from ShopifyQL (the `sales`
-- dataset) over a long lookback window (12-24 months). This is the demand
-- backbone for the growth-aware inventory forecast: it powers per-SKU YoY
-- growth and seasonality curves, which a 30-day shopify_metrics window cannot.
--
-- One row per SKU per calendar month. `month` is the first day of the month
-- (UTC). Refreshed by the sales-history puller via upsert on (sku, month), so
-- re-running backfills/repairs rows without duplicating.

create table if not exists public.sku_sales_history (
  sku text not null,
  month date not null,
  product_title text,
  units_sold integer not null default 0,
  net_sales numeric(12, 2),
  synced_at timestamptz not null default now(),
  primary key (sku, month)
);

-- Per-SKU time series scans (growth + seasonality) read by sku, ordered by month.
create index if not exists sku_sales_history_sku_month_idx
  on public.sku_sales_history (sku, month);

alter table public.sku_sales_history enable row level security;

-- Mirrored connector data: authenticated reads only; the service-role puller
-- writes (service role bypasses RLS), matching the other mirrored tables.
create policy "auth read"
  on public.sku_sales_history for select
  to authenticated
  using (true);
