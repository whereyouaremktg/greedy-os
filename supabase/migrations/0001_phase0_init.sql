-- Glow OS — Phase 0 initial schema.
-- OWNED tables: vendors, purchase_orders, po_line_items, po_payments,
--   manufacturing_runs, campaigns, campaign_tasks, campaign_links.
-- MIRRORED cache tables: qb_financials, shopify_metrics, klaviyo_metrics, hubspot_deals.
-- RLS pattern: any authenticated user reads + writes OWNED; only reads MIRRORED.
-- MIRRORED writes come from the service-role client (cron pullers) which bypasses RLS.

set search_path = public;

create extension if not exists "pgcrypto";

----------------------------------------------------------------------
-- Helpers
----------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

----------------------------------------------------------------------
-- Enums
----------------------------------------------------------------------

create type po_status as enum (
  'draft', 'sent', 'confirmed', 'partially_received',
  'received', 'closed', 'cancelled'
);

create type po_payment_label as enum ('deposit', 'balance', 'other');

create type manufacturing_stage as enum (
  'ordered', 'in_production', 'complete', 'in_transit', 'received'
);

create type campaign_type as enum (
  'dtc_email', 'wholesale_push', 'launch', 'seasonal', 'other'
);

create type campaign_status as enum (
  'planning', 'active', 'complete', 'archived'
);

create type campaign_task_status as enum ('todo', 'in_progress', 'done');

create type campaign_link_source as enum (
  'klaviyo', 'canva', 'shopify', 'hubspot', 'other'
);

----------------------------------------------------------------------
-- OWNED: vendors
----------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendors_set_updated_at before update on public.vendors
  for each row execute function public.set_updated_at();

create index vendors_name_idx on public.vendors (name);

----------------------------------------------------------------------
-- OWNED: purchase_orders + po_line_items + po_payments
----------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  po_number text,
  status po_status not null default 'draft',
  currency text not null default 'USD',
  subtotal numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  order_date date,
  expected_date date,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger purchase_orders_set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

create index purchase_orders_vendor_idx on public.purchase_orders (vendor_id);
create index purchase_orders_status_idx on public.purchase_orders (status);
create index purchase_orders_expected_idx on public.purchase_orders (expected_date);

create table public.po_line_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_name text not null,
  sku text,
  quantity numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  line_total numeric(14,2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create index po_line_items_po_idx on public.po_line_items (purchase_order_id);

create table public.po_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  label po_payment_label not null default 'other',
  amount numeric(14,2) not null default 0,
  due_date date,
  paid boolean not null default false,
  paid_date date,
  created_at timestamptz not null default now()
);

create index po_payments_po_idx on public.po_payments (purchase_order_id);
create index po_payments_due_unpaid_idx on public.po_payments (due_date) where paid = false;

----------------------------------------------------------------------
-- OWNED: manufacturing_runs
----------------------------------------------------------------------

create table public.manufacturing_runs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  product_name text not null,
  variant text,
  quantity integer not null default 0,
  stage manufacturing_stage not null default 'ordered',
  expected_completion_date date,
  expected_arrival_date date,
  actual_completion_date date,
  actual_arrival_date date,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger manufacturing_runs_set_updated_at before update on public.manufacturing_runs
  for each row execute function public.set_updated_at();

create index manufacturing_runs_stage_idx on public.manufacturing_runs (stage);
create index manufacturing_runs_vendor_idx on public.manufacturing_runs (vendor_id);
create index manufacturing_runs_po_idx on public.manufacturing_runs (purchase_order_id);

----------------------------------------------------------------------
-- OWNED: campaigns + campaign_tasks + campaign_links
----------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type campaign_type not null default 'other',
  status campaign_status not null default 'planning',
  start_date date,
  end_date date,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

create index campaigns_status_idx on public.campaigns (status);

create table public.campaign_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  owner text,
  status campaign_task_status not null default 'todo',
  due_date date,
  created_at timestamptz not null default now()
);

create index campaign_tasks_campaign_idx on public.campaign_tasks (campaign_id);
create index campaign_tasks_status_idx on public.campaign_tasks (status);

create table public.campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  label text not null,
  url text not null,
  source campaign_link_source not null default 'other',
  created_at timestamptz not null default now()
);

create index campaign_links_campaign_idx on public.campaign_links (campaign_id);

----------------------------------------------------------------------
-- MIRRORED: qb_financials
----------------------------------------------------------------------

create table public.qb_financials (
  as_of_date date primary key,
  cash_position numeric(14,2),
  ar_total numeric(14,2),
  ar_aging_current numeric(14,2),
  ar_aging_30 numeric(14,2),
  ar_aging_60 numeric(14,2),
  ar_aging_90 numeric(14,2),
  ar_aging_over_90 numeric(14,2),
  ap_total numeric(14,2),
  ap_due_30 numeric(14,2),
  revenue numeric(14,2),
  cogs numeric(14,2),
  expenses numeric(14,2),
  net_income numeric(14,2),
  synced_at timestamptz not null default now()
);

----------------------------------------------------------------------
-- MIRRORED: shopify_metrics
----------------------------------------------------------------------

create table public.shopify_metrics (
  as_of_date date primary key,
  revenue numeric(14,2),
  order_count integer,
  aov numeric(14,2),
  top_products jsonb,
  synced_at timestamptz not null default now()
);

----------------------------------------------------------------------
-- MIRRORED: klaviyo_metrics
----------------------------------------------------------------------

create table public.klaviyo_metrics (
  as_of_date date primary key,
  email_revenue numeric(14,2),
  affiliate_revenue numeric(14,2),
  open_rate numeric(5,4),
  click_rate numeric(5,4),
  campaigns jsonb,
  flows jsonb,
  synced_at timestamptz not null default now()
);

----------------------------------------------------------------------
-- MIRRORED: hubspot_deals  (one row per HubSpot deal — not a daily snapshot)
----------------------------------------------------------------------

create table public.hubspot_deals (
  id text primary key,
  deal_name text not null,
  company text,
  stage text not null,
  amount numeric(14,2),
  state text,
  owner text,
  close_date date,
  synced_at timestamptz not null default now()
);

create index hubspot_deals_stage_idx on public.hubspot_deals (stage);
create index hubspot_deals_state_idx on public.hubspot_deals (state);
create index hubspot_deals_close_date_idx on public.hubspot_deals (close_date);

----------------------------------------------------------------------
-- RLS — OWNED tables: any authenticated user reads + writes.
-- (Two-user shared-state model. created_by audit column kept for later
-- tightening without a migration.)
----------------------------------------------------------------------

alter table public.vendors            enable row level security;
alter table public.purchase_orders    enable row level security;
alter table public.po_line_items      enable row level security;
alter table public.po_payments        enable row level security;
alter table public.manufacturing_runs enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_tasks     enable row level security;
alter table public.campaign_links     enable row level security;

create policy "auth read"  on public.vendors            for select to authenticated using (true);
create policy "auth write" on public.vendors            for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.purchase_orders    for select to authenticated using (true);
create policy "auth write" on public.purchase_orders    for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.po_line_items      for select to authenticated using (true);
create policy "auth write" on public.po_line_items      for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.po_payments        for select to authenticated using (true);
create policy "auth write" on public.po_payments        for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.manufacturing_runs for select to authenticated using (true);
create policy "auth write" on public.manufacturing_runs for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.campaigns          for select to authenticated using (true);
create policy "auth write" on public.campaigns          for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.campaign_tasks     for select to authenticated using (true);
create policy "auth write" on public.campaign_tasks     for all    to authenticated using (true) with check (true);
create policy "auth read"  on public.campaign_links     for select to authenticated using (true);
create policy "auth write" on public.campaign_links     for all    to authenticated using (true) with check (true);

----------------------------------------------------------------------
-- RLS — MIRRORED cache tables: authenticated reads only.
-- Writes happen via service-role client (bypasses RLS) in cron pullers.
----------------------------------------------------------------------

alter table public.qb_financials    enable row level security;
alter table public.shopify_metrics  enable row level security;
alter table public.klaviyo_metrics  enable row level security;
alter table public.hubspot_deals    enable row level security;

create policy "auth read" on public.qb_financials   for select to authenticated using (true);
create policy "auth read" on public.shopify_metrics for select to authenticated using (true);
create policy "auth read" on public.klaviyo_metrics for select to authenticated using (true);
create policy "auth read" on public.hubspot_deals   for select to authenticated using (true);
