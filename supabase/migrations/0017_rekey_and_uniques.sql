-- Glow OS — Phase-1 multi-tenant migration: RE-KEY PKs + per-tenant UNIQUEs.
-- Canonical spec: docs/PHASE1-MIGRATION-SPEC.md (§4, §6, §8, §9).
--
-- WHAT THIS FILE DOES
--   1. Re-keys the 8 MIRRORED cache-table primary keys + connector_credentials
--      to be tenant-prefixed composite keys, so a puller upsert that forgets
--      tenant_id errors on the onConflict target instead of silently
--      overwriting tenant #1's row (and so two tenants' natural keys can't
--      collide).
--   2. Converts products' two independent single-column UNIQUEs
--      (sku, shopify_product_id) into per-tenant composite uniques, which are
--      the onConflict arbiter the Phase-2 product upsert depends on.
--   3. Records the slack_* uniqueness decision (§6): slack_notifications.dedupe_key
--      stays GLOBALLY UNIQUE — explicitly SKIPPED here, not re-keyed.
--
--   tenant_id goes FIRST in every composite so existing single-tenant data
--   clusters and `where tenant_id = …` scans get a usable prefix.
--
-- PRECONDITIONS (must already be true before applying)
--   * tenant_id has been added, backfilled, set NOT NULL, FK'd to
--     public.organizations, and (for the MIRRORED tables + connector_credentials)
--     populated on every row by the preceding tenant_id migration. PK columns
--     are implicitly NOT NULL, so a NULL tenant_id would fail the PK build.
--   * No second organizations row exists yet (the §0 cutover gate / §7 tripwire),
--     so re-keying is behavior-preserving for the live single-tenant business.
--
-- AUTHOR ONLY — DO NOT APPLY in this phase. Apply against a Supabase branch /
-- staging clone first, then prod off-peak through the dashboard SQL editor /
-- configured runner (no Supabase CLI, per project memory). On prod this file is
-- behavior-preserving: every existing row already belongs to the seed Glow org,
-- so the new composite keys index exactly the same rows.
--
-- TXN MODEL — this file is a single Supabase transaction. The backing unique
--   indexes are therefore built NON-concurrently here (see "INDEX BUILD" note
--   below); the verified-tiny single-tenant tables make the brief
--   ACCESS EXCLUSIVE lock a non-issue. If/when a table is large enough that the
--   build lock matters, split per spec §8: pre-build each index with
--   CREATE UNIQUE INDEX CONCURRENTLY in a standalone non-transactional file
--   (0018) and keep ONLY the guarded `… using index` swaps below (0019).
--
-- INDEX BUILD — CONCURRENTLY cannot run inside a transaction, and a single
--   migration file is one transaction. We build each backing unique index with
--   a plain (non-concurrent) CREATE UNIQUE INDEX IF NOT EXISTS, then adopt it
--   via ADD … USING INDEX so the constraint swap is a catalog-only operation
--   with no second data scan. IF NOT EXISTS makes the build re-runnable; the
--   ADD … USING INDEX consumes the index (turning it into the constraint's
--   backing index) so it is not left dangling.
--
-- IDEMPOTENCY / RE-RUNNABILITY
--   * Index builds use CREATE UNIQUE INDEX IF NOT EXISTS.
--   * Every constraint swap (drop old PK/UNIQUE; add new) is wrapped in a
--     DO block trapping undefined_object (old constraint already dropped) and
--     duplicate_table / duplicate_object (new constraint already added), so a
--     re-run after a partial failure is a no-op rather than an error.
--   * CONCURRENTLY-interrupted recovery (only relevant if you split to the
--     0018/0019 model): a failed concurrent build leaves an INVALID index that
--     IF NOT EXISTS will NOT rebuild — DROP INDEX IF EXISTS the *_pkey_new /
--     *_key index first, then re-run.
--
-- =====================================================================
-- PRE-REKEY FK PRECONDITION (spec §4 "FK-vs-rekey ordering — the real trap")
-- =====================================================================
-- None of the re-keyed tables may be the TARGET of an inbound foreign key: the
-- MIRRORED tables are leaf cache tables, connector_credentials has no inbound
-- FK, and products keeps its uuid PK (id) untouched so manufacturing_runs.product_id
-- still references it. We re-key PKs/UNIQUEs that are NOT id, so no child FK is
-- affected. Run the following against the live DB before applying and confirm it
-- returns ZERO rows. If any row appears, that inbound FK must be dropped ->
-- parent key swapped -> FK recreated against the new composite key, in that order.
--
--   select conrelid::regclass as child, confrelid::regclass as parent, conname
--   from   pg_constraint
--   where  contype = 'f'
--   and    confrelid in (
--     'public.qb_financials'::regclass, 'public.shopify_metrics'::regclass,
--     'public.klaviyo_metrics'::regclass, 'public.qb_revenue_by_channel'::regclass,
--     'public.hubspot_deals'::regclass, 'public.shopify_inventory'::regclass,
--     'public.retroship_inventory'::regclass, 'public.sku_sales_history'::regclass,
--     'public.connector_credentials'::regclass, 'public.products'::regclass
--   );
--   -- Expected: zero rows (verified against 0001/0003/0005/0009/0012/0013/0014:
--   --   the only inbound FK to any of these is manufacturing_runs.product_id ->
--   --   products.id, and products.id is NOT re-keyed here).

set search_path = public;

-- =====================================================================
-- (A) RE-KEY THE PRIMARY KEY — 8 MIRRORED tables + connector_credentials
-- =====================================================================
-- The existing PK constraint name for every one of these is the Postgres-implicit
-- "<table>_pkey" (verified: none was named explicitly in 0001/0003/0009/0012/
-- 0013/0014). We drop that and add a new "<table>_pkey" backed by the prebuilt
-- composite index.

----------------------------------------------------------------------
-- qb_financials:  PK (as_of_date) -> (tenant_id, as_of_date)
----------------------------------------------------------------------
create unique index if not exists qb_financials_pkey_new
  on public.qb_financials (tenant_id, as_of_date);

do $$ begin
  alter table public.qb_financials drop constraint qb_financials_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.qb_financials
    add constraint qb_financials_pkey primary key using index qb_financials_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- shopify_metrics:  PK (as_of_date) -> (tenant_id, as_of_date)
----------------------------------------------------------------------
create unique index if not exists shopify_metrics_pkey_new
  on public.shopify_metrics (tenant_id, as_of_date);

do $$ begin
  alter table public.shopify_metrics drop constraint shopify_metrics_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.shopify_metrics
    add constraint shopify_metrics_pkey primary key using index shopify_metrics_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- klaviyo_metrics:  PK (as_of_date) -> (tenant_id, as_of_date)
----------------------------------------------------------------------
create unique index if not exists klaviyo_metrics_pkey_new
  on public.klaviyo_metrics (tenant_id, as_of_date);

do $$ begin
  alter table public.klaviyo_metrics drop constraint klaviyo_metrics_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.klaviyo_metrics
    add constraint klaviyo_metrics_pkey primary key using index klaviyo_metrics_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- qb_revenue_by_channel:  PK (as_of_date) -> (tenant_id, as_of_date)
-- (originates in 0009; shares the QuickBooks puller with qb_financials.)
----------------------------------------------------------------------
create unique index if not exists qb_revenue_by_channel_pkey_new
  on public.qb_revenue_by_channel (tenant_id, as_of_date);

do $$ begin
  alter table public.qb_revenue_by_channel drop constraint qb_revenue_by_channel_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.qb_revenue_by_channel
    add constraint qb_revenue_by_channel_pkey primary key using index qb_revenue_by_channel_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- hubspot_deals:  PK (id text) -> (tenant_id, id)
-- (stage_idx / state_idx / close_date_idx from 0001 are unaffected.)
----------------------------------------------------------------------
create unique index if not exists hubspot_deals_pkey_new
  on public.hubspot_deals (tenant_id, id);

do $$ begin
  alter table public.hubspot_deals drop constraint hubspot_deals_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.hubspot_deals
    add constraint hubspot_deals_pkey primary key using index hubspot_deals_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- shopify_inventory:  PK (variant_id text) -> (tenant_id, variant_id)
-- (qty_idx from 0012 is unaffected.)
----------------------------------------------------------------------
create unique index if not exists shopify_inventory_pkey_new
  on public.shopify_inventory (tenant_id, variant_id);

do $$ begin
  alter table public.shopify_inventory drop constraint shopify_inventory_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.shopify_inventory
    add constraint shopify_inventory_pkey primary key using index shopify_inventory_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- retroship_inventory:  PK (sku, warehouse) -> (tenant_id, sku, warehouse)
-- (onhand_idx / sku_idx from 0013 are unaffected.)
----------------------------------------------------------------------
create unique index if not exists retroship_inventory_pkey_new
  on public.retroship_inventory (tenant_id, sku, warehouse);

do $$ begin
  alter table public.retroship_inventory drop constraint retroship_inventory_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.retroship_inventory
    add constraint retroship_inventory_pkey primary key using index retroship_inventory_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- sku_sales_history:  PK (sku, month) -> (tenant_id, sku, month)
-- (sku_month_idx from 0014 is unaffected.)
----------------------------------------------------------------------
create unique index if not exists sku_sales_history_pkey_new
  on public.sku_sales_history (tenant_id, sku, month);

do $$ begin
  alter table public.sku_sales_history drop constraint sku_sales_history_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.sku_sales_history
    add constraint sku_sales_history_pkey primary key using index sku_sales_history_pkey_new;
exception when duplicate_table then null; end $$;

----------------------------------------------------------------------
-- connector_credentials:  PK (connector, key) -> (tenant_id, connector, key)
-- OWNED data accessed PLATFORM-style (RLS enabled, ZERO policies; service-role
-- only) — re-keyed so one merchant's ('shopify','token') can't collide with
-- another's. The Phase-2 upsert onConflict moves to 'tenant_id,connector,key'
-- and deleteCredentials() must add .eq('tenant_id', t) (§6, §11).
----------------------------------------------------------------------
create unique index if not exists connector_credentials_pkey_new
  on public.connector_credentials (tenant_id, connector, key);

do $$ begin
  alter table public.connector_credentials drop constraint connector_credentials_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.connector_credentials
    add constraint connector_credentials_pkey primary key using index connector_credentials_pkey_new;
exception when duplicate_table then null; end $$;

-- =====================================================================
-- (B) RE-KEY THE TWO PER-TENANT UNIQUEs ON products (PK id uuid UNCHANGED)
-- =====================================================================
-- Verified in 0005: `sku text unique` (implicit constraint products_sku_key) and
-- `shopify_product_id text unique` (implicit products_shopify_product_id_key) —
-- both independent single-column, both nullable. BOTH re-key to a per-tenant
-- composite. PK `id` is left alone because manufacturing_runs.product_id FKs to
-- it; we do not touch that FK.
--
-- DESIGN (spec §4(B)): use a PLAIN composite unique index, NOT a partial
-- `WHERE … is not null`. Under standard SQL NULL-distinct semantics two NULLs are
-- never "equal", so a plain composite already allows multiple NULL-sku /
-- NULL-shopify_product_id rows per tenant — the partial predicate adds nothing
-- and would make the index unusable as an ON CONFLICT arbiter for non-null
-- upserts in some planners. A plain composite is the correct, simplest onConflict
-- target for the Phase-2 product upsert (lib/products/core.ts:184 ->
-- 'tenant_id,shopify_product_id'). The index must be LIVE (this migration) BEFORE
-- the app PR flips onConflict.

create unique index if not exists products_tenant_sku_key
  on public.products (tenant_id, sku);

create unique index if not exists products_tenant_shopify_pid_key
  on public.products (tenant_id, shopify_product_id);

-- Drop the old single-column uniques.
do $$ begin
  alter table public.products drop constraint products_sku_key;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.products drop constraint products_shopify_product_id_key;
exception when undefined_object then null; end $$;

-- Adopt the prebuilt composite indexes as the new per-tenant UNIQUE constraints.
do $$ begin
  alter table public.products
    add constraint products_tenant_sku_key unique using index products_tenant_sku_key;
exception when duplicate_table then null; end $$;

do $$ begin
  alter table public.products
    add constraint products_tenant_shopify_pid_key unique using index products_tenant_shopify_pid_key;
exception when duplicate_table then null; end $$;

-- =====================================================================
-- (C) slack_* uniqueness DECISION (spec §6) — EXPLICITLY SKIPPED
-- =====================================================================
-- slack_notifications.dedupe_key STAYS GLOBALLY UNIQUE. Slack is the internal
-- back-office surface (locked architecture decision #2), there is a single Slack
-- workspace today, and slack_notifications carries NO tenant_id (PLATFORM-classed),
-- so a tenant-prefixed dedupe key would be meaningless. We therefore make NO
-- change to its UNIQUE(dedupe_key) constraint here. Revisit a tenant-prefixed
-- dedupe key only if notifications ever go per-merchant — an app-code concern,
-- not Phase-1 schema. slack_identities likewise keeps its existing key
-- (slack_user_id); its onConflict 'slack_user_id' stays unchanged (do NOT "fix").
--
-- No DDL emitted for the slack_* tables in this file — intentional.

-- =====================================================================
-- PHASE-2 APP-CODE HAND-OFF (spec §11) — schema + app obligations travel together.
-- GATE: no second organizations row (and no app.allow_second_tenant=on) until ALL
-- of these onConflict re-keys ship; the matching unique index must exist (this
-- file) BEFORE the app flips its onConflict target.
--   * lib/pullers/shopify.ts:475              shopify_metrics        'as_of_date'      -> 'tenant_id,as_of_date'
--   * lib/pullers/quickbooks.ts:471           qb_financials          'as_of_date'      -> 'tenant_id,as_of_date'
--   * lib/pullers/quickbooks.ts:492           qb_revenue_by_channel  'as_of_date'      -> 'tenant_id,as_of_date'
--   * lib/pullers/klaviyo.ts:59               klaviyo_metrics        'as_of_date'      -> 'tenant_id,as_of_date'
--   * lib/pullers/hubspot.ts:198              hubspot_deals          'id'              -> 'tenant_id,id'
--   * lib/pullers/shopify-sales-history.ts:134 sku_sales_history     'sku,month'       -> 'tenant_id,sku,month'
--   * lib/products/core.ts:184                products               'shopify_product_id' -> 'tenant_id,shopify_product_id'
--   * lib/connectors/credentials.ts:285       connector_credentials  'connector,key'   -> 'tenant_id,connector,key'
--     and lib/connectors/credentials.ts:300   deleteCredentials() must add .eq('tenant_id', t).
