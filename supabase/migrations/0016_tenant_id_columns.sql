-- Glow OS — Phase 1 multi-tenant migration, step 2 of 7: add tenant_id columns.
--
-- Adds the tenant_id scoping column to every tenant-scoped table on a LIVE,
-- populated Supabase DB without downtime and without a table rewrite. Covers
-- all 9 OWNED tables, all 8 MIRRORED cache tables, and connector_credentials
-- (OWNED-classed data, accessed PLATFORM-style — see 0015 / spec §6). The two
-- slack_* tables are PLATFORM/internal and intentionally NOT tenant-scoped.
--
-- This file ONLY adds/backfills/constrains tenant_id. It deliberately does NOT:
--   * re-key any primary key or unique constraint        -> 0017
--   * create tenant_id / composite indexes               -> 0017 (CONCURRENTLY)
--   * rewrite RLS policies                                -> 0018
--   * drop the created_by/updated_by auth.uid() defaults  -> 0021 (spec §3b)
-- Splitting these keeps each risky / independently-revertible concern in its
-- own transaction with a coherent failure boundary.
--
-- Per-table ordering (every step is lock-light on PG15 — spec §3):
--   1. ADD COLUMN IF NOT EXISTS tenant_id uuid   (nullable, no default, no FK)
--      -> metadata-only catalog change, ACCESS EXCLUSIVE held for microseconds.
--   2. backfill to the seeded tenant-#1 org by subselect-by-slug ('glow');
--      denormalized child tables backfill FROM their parent (parents first).
--   3. post-backfill assertion -> abort LOUDLY before SET NOT NULL.
--   4. NOT-NULL via NOT-VALID CHECK -> VALIDATE -> SET NOT NULL -> drop CHECK
--      (lock-light: VALIDATE / SET NOT NULL take only SHARE UPDATE EXCLUSIVE and
--      PG12+ skips the scan because the validated CHECK already proves it).
--   5. FK to organizations, ON DELETE RESTRICT, added NOT VALID then VALIDATEd.
--   6. add the JWT-claim column DEFAULT *last* (a JWT-reading default during
--      backfill would rewrite the table or stamp wrong values for this session).
--
-- The seed org (slug = 'glow') and the helpers it references are created in
-- 0015 — this file MUST run after 0015. On prod the entire file is
-- behavior-preserving: every existing row becomes a Glow-org row, leaving a
-- perfectly valid single-tenant DB.
--
-- IDEMPOTENT where practical: ADD COLUMN IF NOT EXISTS, backfills guarded by
-- WHERE tenant_id IS NULL (re-runnable, never overwrites a real tenant_id), and
-- every constraint add/drop wrapped so a partial re-run does not error.
--
-- DO NOT APPLY in this phase — author only. Apply against a Supabase branch /
-- staging clone first, observe the assertions, then ship to prod ahead of the
-- Phase-2 app PR (the cutover gate — spec §0/§11).

set search_path = public;

----------------------------------------------------------------------
-- Sanity precondition: the seed org must exist before we backfill.
-- (Created in 0015 by `insert ... where slug = 'glow' on conflict do nothing`.)
-- Fail loudly here rather than silently stamping NULL into every table.
----------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.organizations where slug = 'glow') then
    raise exception
      'seed organization (slug=''glow'') not found: apply 0015_tenancy_core.sql before 0016';
  end if;
end $$;

----------------------------------------------------------------------
-- ============================================================ --
-- OWNED tables (9)                                              --
-- ============================================================ --
-- Org-scoped read + write surface. Each gets its own tenant_id;
-- the four denormalized children (po_line_items, po_payments,
-- campaign_tasks, campaign_links) backfill FROM their parent so the
-- value is provably consistent, which is also why we keep their
-- existing FKs and denormalize tenant_id (RLS evaluates locally,
-- no join). PK stays `id uuid` for every OWNED table (re-key is 0017
-- only for products' two per-tenant UNIQUEs).
----------------------------------------------------------------------

----------------------------------------------------------------------
-- OWNED: vendors  (parent — must precede purchase_orders chain)
----------------------------------------------------------------------

alter table public.vendors add column if not exists tenant_id uuid;

update public.vendors
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.vendors where tenant_id is null) then
    raise exception 'backfill incomplete for vendors: % null rows',
      (select count(*) from public.vendors where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.vendors
    add constraint vendors_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.vendors validate constraint vendors_tenant_not_null;
alter table public.vendors alter column tenant_id set not null;
do $$ begin
  alter table public.vendors drop constraint vendors_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.vendors
    add constraint vendors_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.vendors validate constraint vendors_tenant_id_fkey;

alter table public.vendors
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: purchase_orders  (parent of po_line_items + po_payments)
----------------------------------------------------------------------

alter table public.purchase_orders add column if not exists tenant_id uuid;

update public.purchase_orders
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.purchase_orders where tenant_id is null) then
    raise exception 'backfill incomplete for purchase_orders: % null rows',
      (select count(*) from public.purchase_orders where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.purchase_orders
    add constraint purchase_orders_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.purchase_orders validate constraint purchase_orders_tenant_not_null;
alter table public.purchase_orders alter column tenant_id set not null;
do $$ begin
  alter table public.purchase_orders drop constraint purchase_orders_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.purchase_orders
    add constraint purchase_orders_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.purchase_orders validate constraint purchase_orders_tenant_id_fkey;

alter table public.purchase_orders
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: po_line_items  (DENORMALIZED child — backfill FROM purchase_orders)
-- No created_by column; line_total is GENERATED. The Phase-2 batch insert
-- (lib/purchase-orders/core.ts:132) must stamp tenant_id on every line row.
----------------------------------------------------------------------

alter table public.po_line_items add column if not exists tenant_id uuid;

update public.po_line_items li
   set tenant_id = po.tenant_id
  from public.purchase_orders po
 where li.purchase_order_id = po.id
   and li.tenant_id is null;

do $$
begin
  if exists (select 1 from public.po_line_items where tenant_id is null) then
    raise exception 'backfill incomplete for po_line_items: % null rows',
      (select count(*) from public.po_line_items where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.po_line_items
    add constraint po_line_items_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.po_line_items validate constraint po_line_items_tenant_not_null;
alter table public.po_line_items alter column tenant_id set not null;
do $$ begin
  alter table public.po_line_items drop constraint po_line_items_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.po_line_items
    add constraint po_line_items_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.po_line_items validate constraint po_line_items_tenant_id_fkey;

alter table public.po_line_items
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: po_payments  (DENORMALIZED child — backfill FROM purchase_orders)
-- No insert site in app code today; no created_by column. Phase-2 must add
-- .eq('tenant_id', t) to the two SERVICE-ROLE updates in
-- app/api/slack/interactivity/route.ts:123-127 (mark-paid) and :157-160 (snooze)
-- — both bypass RLS and filter by payment id only (spec §0 time-bomb).
----------------------------------------------------------------------

alter table public.po_payments add column if not exists tenant_id uuid;

update public.po_payments p
   set tenant_id = po.tenant_id
  from public.purchase_orders po
 where p.purchase_order_id = po.id
   and p.tenant_id is null;

do $$
begin
  if exists (select 1 from public.po_payments where tenant_id is null) then
    raise exception 'backfill incomplete for po_payments: % null rows',
      (select count(*) from public.po_payments where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.po_payments
    add constraint po_payments_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.po_payments validate constraint po_payments_tenant_not_null;
alter table public.po_payments alter column tenant_id set not null;
do $$ begin
  alter table public.po_payments drop constraint po_payments_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.po_payments
    add constraint po_payments_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.po_payments validate constraint po_payments_tenant_id_fkey;

alter table public.po_payments
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: manufacturing_runs
-- Also written by the AI tool createRunCore (lib/ai/tools.ts:469); under the
-- Slack routes that runs SERVICE-ROLE (no JWT claim), so the JWT default will
-- NOT fire — Phase-2 must thread + stamp tenant_id explicitly.
----------------------------------------------------------------------

alter table public.manufacturing_runs add column if not exists tenant_id uuid;

update public.manufacturing_runs
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.manufacturing_runs where tenant_id is null) then
    raise exception 'backfill incomplete for manufacturing_runs: % null rows',
      (select count(*) from public.manufacturing_runs where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.manufacturing_runs
    add constraint manufacturing_runs_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.manufacturing_runs validate constraint manufacturing_runs_tenant_not_null;
alter table public.manufacturing_runs alter column tenant_id set not null;
do $$ begin
  alter table public.manufacturing_runs drop constraint manufacturing_runs_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.manufacturing_runs
    add constraint manufacturing_runs_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.manufacturing_runs validate constraint manufacturing_runs_tenant_id_fkey;

alter table public.manufacturing_runs
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: campaigns  (parent of campaign_tasks + campaign_links)
-- Also created via the AI tool createCampaignCore (lib/ai/tools.ts:709) which
-- runs SERVICE-ROLE under Slack — Phase-2 must stamp tenant_id explicitly.
----------------------------------------------------------------------

alter table public.campaigns add column if not exists tenant_id uuid;

update public.campaigns
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.campaigns where tenant_id is null) then
    raise exception 'backfill incomplete for campaigns: % null rows',
      (select count(*) from public.campaigns where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.campaigns
    add constraint campaigns_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.campaigns validate constraint campaigns_tenant_not_null;
alter table public.campaigns alter column tenant_id set not null;
do $$ begin
  alter table public.campaigns drop constraint campaigns_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.campaigns
    add constraint campaigns_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.campaigns validate constraint campaigns_tenant_id_fkey;

alter table public.campaigns
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: campaign_tasks  (DENORMALIZED child — backfill FROM campaigns)
-- No created_by column. THREE insert sites (lib/campaigns/core.ts:62,
-- lib/actions/campaigns.ts:109, lib/ai/tools.ts:736); the AI-tool path runs
-- SERVICE-ROLE under Slack so it must stamp tenant_id explicitly (spec §3a).
----------------------------------------------------------------------

alter table public.campaign_tasks add column if not exists tenant_id uuid;

update public.campaign_tasks ct
   set tenant_id = c.tenant_id
  from public.campaigns c
 where ct.campaign_id = c.id
   and ct.tenant_id is null;

do $$
begin
  if exists (select 1 from public.campaign_tasks where tenant_id is null) then
    raise exception 'backfill incomplete for campaign_tasks: % null rows',
      (select count(*) from public.campaign_tasks where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.campaign_tasks
    add constraint campaign_tasks_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.campaign_tasks validate constraint campaign_tasks_tenant_not_null;
alter table public.campaign_tasks alter column tenant_id set not null;
do $$ begin
  alter table public.campaign_tasks drop constraint campaign_tasks_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.campaign_tasks
    add constraint campaign_tasks_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.campaign_tasks validate constraint campaign_tasks_tenant_id_fkey;

alter table public.campaign_tasks
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: campaign_links  (DENORMALIZED child — backfill FROM campaigns)
-- No created_by column. lib/actions/campaigns.ts:180 inserts parsed.data
-- directly (no tenant_id field) — the JWT default covers that RLS-surface
-- insert, but Phase-2 must verify (spec §3a / §11).
----------------------------------------------------------------------

alter table public.campaign_links add column if not exists tenant_id uuid;

update public.campaign_links cl
   set tenant_id = c.tenant_id
  from public.campaigns c
 where cl.campaign_id = c.id
   and cl.tenant_id is null;

do $$
begin
  if exists (select 1 from public.campaign_links where tenant_id is null) then
    raise exception 'backfill incomplete for campaign_links: % null rows',
      (select count(*) from public.campaign_links where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.campaign_links
    add constraint campaign_links_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.campaign_links validate constraint campaign_links_tenant_not_null;
alter table public.campaign_links alter column tenant_id set not null;
do $$ begin
  alter table public.campaign_links drop constraint campaign_links_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.campaign_links
    add constraint campaign_links_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.campaign_links validate constraint campaign_links_tenant_id_fkey;

alter table public.campaign_links
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- OWNED: products  (PK stays id uuid; the two per-tenant UNIQUE re-keys
-- on (tenant_id, sku) and (tenant_id, shopify_product_id) are 0017).
-- HYBRID write surface: manual create (lib/products/core.ts:69) + Shopify-sync
-- upsert (lib/products/core.ts:184). The cron sync path
-- (app/api/sync/shopify-products/route.ts:14, actorUserId=null) must resolve +
-- pass tenant_id explicitly in Phase-2.
----------------------------------------------------------------------

alter table public.products add column if not exists tenant_id uuid;

update public.products
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.products where tenant_id is null) then
    raise exception 'backfill incomplete for products: % null rows',
      (select count(*) from public.products where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.products
    add constraint products_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.products validate constraint products_tenant_not_null;
alter table public.products alter column tenant_id set not null;
do $$ begin
  alter table public.products drop constraint products_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.products
    add constraint products_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.products validate constraint products_tenant_id_fkey;

alter table public.products
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- ============================================================ --
-- MIRRORED cache tables (8)                                     --
-- ============================================================ --
-- Org-scoped READ only; all writes come from SERVICE-ROLE pullers that bypass
-- RLS. The JWT default here is non-load-bearing (pullers carry no JWT claim) —
-- it exists only so a forgotten tenant_id throws a NOT-NULL violation at the
-- first row instead of writing a NULL-tenant orphan. Phase-2 re-keys each PK to
-- include tenant_id (0017) and every puller upsert must carry an explicit
-- tenant_id with the new onConflict target (spec §4 / §11).
----------------------------------------------------------------------

----------------------------------------------------------------------
-- MIRRORED: qb_financials  (daily snapshot; current PK as_of_date)
----------------------------------------------------------------------

alter table public.qb_financials add column if not exists tenant_id uuid;

update public.qb_financials
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.qb_financials where tenant_id is null) then
    raise exception 'backfill incomplete for qb_financials: % null rows',
      (select count(*) from public.qb_financials where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.qb_financials
    add constraint qb_financials_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.qb_financials validate constraint qb_financials_tenant_not_null;
alter table public.qb_financials alter column tenant_id set not null;
do $$ begin
  alter table public.qb_financials drop constraint qb_financials_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.qb_financials
    add constraint qb_financials_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.qb_financials validate constraint qb_financials_tenant_id_fkey;

alter table public.qb_financials
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: shopify_metrics  (daily snapshot; current PK as_of_date)
----------------------------------------------------------------------

alter table public.shopify_metrics add column if not exists tenant_id uuid;

update public.shopify_metrics
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.shopify_metrics where tenant_id is null) then
    raise exception 'backfill incomplete for shopify_metrics: % null rows',
      (select count(*) from public.shopify_metrics where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.shopify_metrics
    add constraint shopify_metrics_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.shopify_metrics validate constraint shopify_metrics_tenant_not_null;
alter table public.shopify_metrics alter column tenant_id set not null;
do $$ begin
  alter table public.shopify_metrics drop constraint shopify_metrics_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.shopify_metrics
    add constraint shopify_metrics_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.shopify_metrics validate constraint shopify_metrics_tenant_id_fkey;

alter table public.shopify_metrics
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: klaviyo_metrics  (daily snapshot; current PK as_of_date)
----------------------------------------------------------------------

alter table public.klaviyo_metrics add column if not exists tenant_id uuid;

update public.klaviyo_metrics
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.klaviyo_metrics where tenant_id is null) then
    raise exception 'backfill incomplete for klaviyo_metrics: % null rows',
      (select count(*) from public.klaviyo_metrics where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.klaviyo_metrics
    add constraint klaviyo_metrics_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.klaviyo_metrics validate constraint klaviyo_metrics_tenant_not_null;
alter table public.klaviyo_metrics alter column tenant_id set not null;
do $$ begin
  alter table public.klaviyo_metrics drop constraint klaviyo_metrics_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.klaviyo_metrics
    add constraint klaviyo_metrics_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.klaviyo_metrics validate constraint klaviyo_metrics_tenant_id_fkey;

alter table public.klaviyo_metrics
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: qb_revenue_by_channel  (added in 0009; daily snapshot, PK as_of_date)
----------------------------------------------------------------------

alter table public.qb_revenue_by_channel add column if not exists tenant_id uuid;

update public.qb_revenue_by_channel
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.qb_revenue_by_channel where tenant_id is null) then
    raise exception 'backfill incomplete for qb_revenue_by_channel: % null rows',
      (select count(*) from public.qb_revenue_by_channel where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.qb_revenue_by_channel
    add constraint qb_revenue_by_channel_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.qb_revenue_by_channel validate constraint qb_revenue_by_channel_tenant_not_null;
alter table public.qb_revenue_by_channel alter column tenant_id set not null;
do $$ begin
  alter table public.qb_revenue_by_channel drop constraint qb_revenue_by_channel_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.qb_revenue_by_channel
    add constraint qb_revenue_by_channel_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.qb_revenue_by_channel validate constraint qb_revenue_by_channel_tenant_id_fkey;

alter table public.qb_revenue_by_channel
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: hubspot_deals  (one row per deal; current PK id text)
-- Phase-2 must tenant-scope THREE write sites + a select: full-clear delete
-- (:136), upsert onConflict (:198), and the stale-row delete (:216) fed by the
-- unscoped select('id') (:207-208) — spec §0 time-bomb.
----------------------------------------------------------------------

alter table public.hubspot_deals add column if not exists tenant_id uuid;

update public.hubspot_deals
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.hubspot_deals where tenant_id is null) then
    raise exception 'backfill incomplete for hubspot_deals: % null rows',
      (select count(*) from public.hubspot_deals where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.hubspot_deals
    add constraint hubspot_deals_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.hubspot_deals validate constraint hubspot_deals_tenant_not_null;
alter table public.hubspot_deals alter column tenant_id set not null;
do $$ begin
  alter table public.hubspot_deals drop constraint hubspot_deals_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.hubspot_deals
    add constraint hubspot_deals_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.hubspot_deals validate constraint hubspot_deals_tenant_id_fkey;

alter table public.hubspot_deals
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: shopify_inventory  (added in 0012; current PK variant_id text)
-- Phase-2 must scope the full-replace delete (lib/pullers/shopify-inventory.ts
-- :125-127, .neq('variant_id','') wipes the WHOLE table) to .eq('tenant_id', t)
-- and stamp the insert batch (:133) — spec §0 time-bomb.
----------------------------------------------------------------------

alter table public.shopify_inventory add column if not exists tenant_id uuid;

update public.shopify_inventory
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.shopify_inventory where tenant_id is null) then
    raise exception 'backfill incomplete for shopify_inventory: % null rows',
      (select count(*) from public.shopify_inventory where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.shopify_inventory
    add constraint shopify_inventory_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.shopify_inventory validate constraint shopify_inventory_tenant_not_null;
alter table public.shopify_inventory alter column tenant_id set not null;
do $$ begin
  alter table public.shopify_inventory drop constraint shopify_inventory_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.shopify_inventory
    add constraint shopify_inventory_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.shopify_inventory validate constraint shopify_inventory_tenant_id_fkey;

alter table public.shopify_inventory
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: retroship_inventory  (added in 0013; current PK (sku, warehouse))
-- READ-ONLY today (lib/inventory/load.ts:123); no puller exists yet (ingestion
-- blocked on a sample export). Re-key to (tenant_id, sku, warehouse) lands in
-- 0017; the future puller must full-replace tenant-scoped.
----------------------------------------------------------------------

alter table public.retroship_inventory add column if not exists tenant_id uuid;

update public.retroship_inventory
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.retroship_inventory where tenant_id is null) then
    raise exception 'backfill incomplete for retroship_inventory: % null rows',
      (select count(*) from public.retroship_inventory where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.retroship_inventory
    add constraint retroship_inventory_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.retroship_inventory validate constraint retroship_inventory_tenant_not_null;
alter table public.retroship_inventory alter column tenant_id set not null;
do $$ begin
  alter table public.retroship_inventory drop constraint retroship_inventory_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.retroship_inventory
    add constraint retroship_inventory_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.retroship_inventory validate constraint retroship_inventory_tenant_id_fkey;

alter table public.retroship_inventory
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- MIRRORED: sku_sales_history  (added in 0014; current PK (sku, month))
----------------------------------------------------------------------

alter table public.sku_sales_history add column if not exists tenant_id uuid;

update public.sku_sales_history
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.sku_sales_history where tenant_id is null) then
    raise exception 'backfill incomplete for sku_sales_history: % null rows',
      (select count(*) from public.sku_sales_history where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.sku_sales_history
    add constraint sku_sales_history_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.sku_sales_history validate constraint sku_sales_history_tenant_not_null;
alter table public.sku_sales_history alter column tenant_id set not null;
do $$ begin
  alter table public.sku_sales_history drop constraint sku_sales_history_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.sku_sales_history
    add constraint sku_sales_history_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.sku_sales_history validate constraint sku_sales_history_tenant_id_fkey;

alter table public.sku_sales_history
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- ============================================================ --
-- connector_credentials                                        --
-- ============================================================ --
-- OWNED data (per-shop connector secrets) accessed PLATFORM-style: RLS enabled
-- with ZERO policies, service-role only (spec §6). It gets tenant_id HERE so
-- one merchant's ('shopify','token') cannot collide with another's; the PK
-- re-key to (tenant_id, connector, key) lands in 0017. value is PLAINTEXT
-- (Vault is Phase 3); we add NO merchant-facing read policy. Phase-2 must add
-- .eq('tenant_id', t) to deleteCredentials() (lib/connectors/credentials.ts:300)
-- or a Disconnect wipes that connector for ALL tenants (spec §0 time-bomb).
----------------------------------------------------------------------

alter table public.connector_credentials add column if not exists tenant_id uuid;

update public.connector_credentials
   set tenant_id = (select id from public.organizations where slug = 'glow')
 where tenant_id is null;

do $$
begin
  if exists (select 1 from public.connector_credentials where tenant_id is null) then
    raise exception 'backfill incomplete for connector_credentials: % null rows',
      (select count(*) from public.connector_credentials where tenant_id is null);
  end if;
end $$;

do $$ begin
  alter table public.connector_credentials
    add constraint connector_credentials_tenant_not_null check (tenant_id is not null) not valid;
exception when duplicate_object then null; end $$;
alter table public.connector_credentials validate constraint connector_credentials_tenant_not_null;
alter table public.connector_credentials alter column tenant_id set not null;
do $$ begin
  alter table public.connector_credentials drop constraint connector_credentials_tenant_not_null;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.connector_credentials
    add constraint connector_credentials_tenant_id_fkey
    foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;
exception when duplicate_object then null; end $$;
alter table public.connector_credentials validate constraint connector_credentials_tenant_id_fkey;

alter table public.connector_credentials
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;

----------------------------------------------------------------------
-- Final guard: every tenant-scoped table now has a NOT-NULL tenant_id with a
-- validated FK to organizations. NEXT: 0017 re-keys the MIRRORED + products +
-- connector_credentials PK/UNIQUE constraints and builds tenant indexes
-- CONCURRENTLY; 0018 flips RLS to org-scoped. DO NOT onboard a second
-- organization (and do NOT set app.allow_second_tenant=on) until the Phase-2
-- app PR scopes every cross-tenant delete/update/select (spec §0/§11).
----------------------------------------------------------------------
