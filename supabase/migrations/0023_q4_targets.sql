-- Greedy OS — Q4 Targets dashboard.
--
-- MIRRORED (service-role writes, authenticated reads):
--   shopify_orders        one row per Shopify order in a tracked window (Q4 2025
--                         baseline + Q4 2026), bucketed by lib/targets/classify.ts.
--                         No customer PII: ids, money, tags, channel, timestamps.
--   shopify_order_lines   product lines per order (sku, qty, money) — feeds the
--                         launch tracker's per-SKU sell-through and seeding units.
--   targets_sync_state    puller watermarks per window (resumable backfill).
--   targets_sync_runs     one row per sync run (cron or manual) → "last synced".
-- OWNED (authenticated read + write):
--   targets_settings      key/value jsonb: tiers, guardrails, manual overrides,
--                         BFCM dates, staffing tiers, classification rules.
-- VIEW:
--   shopify_daily_sales   day × bucket rollup, security_invoker so RLS applies.

----------------------------------------------------------------------
-- shopify_orders
----------------------------------------------------------------------
create table if not exists public.shopify_orders (
  id text primary key,                       -- gid://shopify/Order/...
  name text not null,                        -- #73074
  created_at timestamptz not null,
  processed_at timestamptz not null,
  updated_at timestamptz not null,
  cancelled_at timestamptz,
  day_local date not null,                   -- processed_at in the store timezone
  financial_status text,
  fulfillment_status text,
  first_fulfilled_at timestamptz,            -- earliest successful fulfillment
  source_name text,
  app_name text,
  channel_name text,
  tags text[] not null default '{}',
  gross_sales numeric(14,2) not null default 0,   -- merchandise before discounts
  discounts numeric(14,2) not null default 0,
  returns numeric(14,2) not null default 0,       -- merchandise refunded/removed
  net_sales numeric(14,2) not null default 0,     -- gross - discounts - returns
  shipping numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  units integer not null default 0,               -- product units (non-product SKUs excluded)
  customer_order_count integer,                   -- customer's lifetime orders incl. this one
  bucket text not null,
  bucket_reason text,
  synced_at timestamptz not null default now()
);

create index if not exists shopify_orders_day_idx on public.shopify_orders (day_local);
create index if not exists shopify_orders_bucket_day_idx on public.shopify_orders (bucket, day_local);
create index if not exists shopify_orders_updated_idx on public.shopify_orders (updated_at);

alter table public.shopify_orders enable row level security;
do $$ begin
  create policy "auth read" on public.shopify_orders for select to authenticated using (true);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------------
-- shopify_order_lines
----------------------------------------------------------------------
create table if not exists public.shopify_order_lines (
  order_id text not null references public.shopify_orders(id) on delete cascade,
  line_index integer not null,
  sku text,
  product_id text,
  variant_id text,
  title text,
  variant_title text,
  quantity integer not null default 0,
  current_quantity integer not null default 0,
  gross numeric(14,2) not null default 0,
  discounted numeric(14,2) not null default 0,
  is_product boolean not null default true,
  primary key (order_id, line_index)
);

create index if not exists shopify_order_lines_sku_idx on public.shopify_order_lines (sku);
create index if not exists shopify_order_lines_product_idx on public.shopify_order_lines (product_id);

alter table public.shopify_order_lines enable row level security;
do $$ begin
  create policy "auth read" on public.shopify_order_lines for select to authenticated using (true);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------------
-- targets_sync_state / targets_sync_runs
----------------------------------------------------------------------
create table if not exists public.targets_sync_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.targets_sync_state enable row level security;
do $$ begin
  create policy "auth read" on public.targets_sync_state for select to authenticated using (true);
exception when duplicate_object then null; end $$;

create table if not exists public.targets_sync_runs (
  id bigserial primary key,
  job text not null,                       -- shopify_orders
  trigger text not null default 'cron',    -- cron | manual | backfill
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  orders_upserted integer not null default 0,
  pages integer not null default 0,
  complete boolean not null default false, -- false when the time budget ran out mid-window
  message text
);

create index if not exists targets_sync_runs_job_started_idx on public.targets_sync_runs (job, started_at desc);

alter table public.targets_sync_runs enable row level security;
do $$ begin
  create policy "auth read" on public.targets_sync_runs for select to authenticated using (true);
exception when duplicate_object then null; end $$;

----------------------------------------------------------------------
-- targets_settings (OWNED, key/value)
----------------------------------------------------------------------
create table if not exists public.targets_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

alter table public.targets_settings enable row level security;
do $$ begin
  create policy "auth read" on public.targets_settings for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth write" on public.targets_settings for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Defaults. Edited from the dashboard; `on conflict do nothing` keeps edits.
insert into public.targets_settings (key, value) values
  ('q4_2026', '{
     "year": 2026,
     "tiers": [
       {"key": "plan", "label": "Plan", "amount": 1100000},
       {"key": "stretch", "label": "Stretch", "amount": 1200000},
       {"key": "crush", "label": "Crush", "amount": 1500000}
     ],
     "guardrails": {"net_margin_min_pct": 25, "cash_reserve_min": 150000},
     "overrides": {"net_margin_pct": null, "cash_balance": null, "non_shopify_baseline_2025": 130000, "notes": ""},
     "bfcm": {"start": "2026-11-09", "end": "2026-12-15", "bf_cm_start": "2026-11-27", "bf_cm_end": "2026-11-30", "early_access": "2026-11-24", "sla_ship_by": "2026-12-03"},
     "staffing": {"bfcm_orders": {"safe": 2840, "baseline": 4040, "aggressive": 4960}, "busiest_day": {"safe": 1140, "baseline": 1640, "aggressive": 2030}},
     "flags": {"discount_rate_max_pct": 10},
     "count_b2b_in_total": true
   }'::jsonb)
on conflict (key) do nothing;

----------------------------------------------------------------------
-- shopify_daily_sales view
----------------------------------------------------------------------
create or replace view public.shopify_daily_sales
with (security_invoker = true) as
select
  day_local,
  bucket,
  count(*)::integer                       as orders,
  sum(gross_sales)::numeric(14,2)         as gross_sales,
  sum(discounts)::numeric(14,2)           as discounts,
  sum(returns)::numeric(14,2)             as returns,
  sum(net_sales)::numeric(14,2)           as net_sales,
  sum(shipping)::numeric(14,2)            as shipping,
  sum(units)::integer                     as units,
  count(*) filter (where customer_order_count = 1)::integer as new_customers,
  count(*) filter (where first_fulfilled_at is not null)::integer as fulfilled_orders
from public.shopify_orders
group by day_local, bucket;

grant select on public.shopify_daily_sales to authenticated, service_role;
