-- Glow OS — Phase-1 multi-tenant RLS rewrite.
-- Replaces the Phase-0 "any authenticated user reads + writes" model
-- (the using(true) "auth read"/"auth write" policies from 0001/0002/0004/0005
-- and the mirrored read policies from 0009/0012/0013/0014) with org-scoped
-- policies keyed on tenant_id, plus a platform-admin cross-tenant read override.
--
-- This is the dead-last migration in the Phase-1 set: it runs only after every
-- tenant table has a NOT NULL tenant_id (0016/0017), the composite indexes are
-- built (0018_indexes per the canonical file split), and the PKs/uniques are
-- re-keyed (0019). By the time these policies flip on, no row exists that can
-- fail the predicate, so applying this file is behavior-preserving on the
-- single-tenant prod DB (all rows belong to the seeded 'glow' org).
--
-- Policy classes (see PHASE1-MIGRATION-SPEC §5):
--   Class 1 — OWNED:    org-scoped SELECT + ALL (read + write) via current_org_ids(),
--                       with a matching WITH CHECK so a merchant can never write
--                       outside their org.
--   Class 2 — MIRRORED: org-scoped SELECT only. No write policy -> with RLS enabled
--                       and no permissive write policy, every non-service-role write
--                       is denied; only the RLS-bypassing service-role pullers write.
--   Class 3 — PLATFORM: slack_notifications + slack_identities, gated by
--                       is_platform_admin(); drops the dangerous 0004 "auth write"
--                       hole (today any authenticated user can rewrite staff mappings).
--   Class 4 — platform-admin cross-tenant READ override on every OWNED + MIRRORED
--                       table (17 tables) for the internal /admin back-office.
--                       Read-only; no cross-tenant write override in Phase 1.
--
-- connector_credentials is deliberately left untouched: it keeps the 0003 model
-- (RLS enabled, ZERO policies, service-role only). It gets NO org read/write and
-- NO Class-4 admin read — admins must not read raw plaintext secrets via SQL.
--
-- Every helper call is wrapped in (select ...) so a STABLE SECURITY DEFINER
-- function is evaluated once per query as an InitPlan rather than once per row.
-- This is MANDATORY, not stylistic: an unwrapped call on a seq scan of N rows
-- runs the function N times — fatal on shopify_inventory / hubspot_deals /
-- sku_sales_history-sized scans.
--
-- Drops are idempotent (drop policy if exists); creates are guarded the same way
-- so a partial re-apply does not error. No table is left with a using(true) policy.
-- AUTHOR ONLY — do NOT apply in this phase. Apply against a Supabase branch first.
--
-- Phase-2 app-code GATE (PHASE1-MIGRATION-SPEC §11): RLS protects only the merchant
-- JWT surface. Service-role writes (all pullers, the Slack AI-tool path, the two
-- po_payments updates, connector_credentials, the cron product sync) bypass RLS
-- entirely. No second organizations row may exist until every service-role write
-- site carries an explicit .eq('tenant_id', t) filter / stamp.

set search_path = public;

----------------------------------------------------------------------
-- Class 1 — OWNED: org-scoped read + write.
-- Tables: vendors, purchase_orders, po_line_items, po_payments,
--   manufacturing_runs, campaigns, campaign_tasks, campaign_links, products.
--
-- "org read"  : a merchant/staff member may SELECT only rows in an org they
--               resolve to via current_org_ids() (JWT org_id claim for merchants,
--               membership rows for staff).
-- "org write" : same predicate for USING (rows you may target on UPDATE/DELETE)
--               and WITH CHECK (the tenant_id you may INSERT/leave behind). The
--               WITH CHECK is the airtight part — even a bypassed column default
--               cannot move a row into another tenant.
----------------------------------------------------------------------

-- vendors
drop policy if exists "auth read"  on public.vendors;
drop policy if exists "auth write" on public.vendors;
drop policy if exists "org read"  on public.vendors;
drop policy if exists "org write" on public.vendors;
create policy "org read" on public.vendors
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.vendors
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- purchase_orders
drop policy if exists "auth read"  on public.purchase_orders;
drop policy if exists "auth write" on public.purchase_orders;
drop policy if exists "org read"  on public.purchase_orders;
drop policy if exists "org write" on public.purchase_orders;
create policy "org read" on public.purchase_orders
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.purchase_orders
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- po_line_items (tenant_id denormalized from purchase_orders)
drop policy if exists "auth read"  on public.po_line_items;
drop policy if exists "auth write" on public.po_line_items;
drop policy if exists "org read"  on public.po_line_items;
drop policy if exists "org write" on public.po_line_items;
create policy "org read" on public.po_line_items
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.po_line_items
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- po_payments (tenant_id denormalized from purchase_orders)
drop policy if exists "auth read"  on public.po_payments;
drop policy if exists "auth write" on public.po_payments;
drop policy if exists "org read"  on public.po_payments;
drop policy if exists "org write" on public.po_payments;
create policy "org read" on public.po_payments
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.po_payments
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- manufacturing_runs
drop policy if exists "auth read"  on public.manufacturing_runs;
drop policy if exists "auth write" on public.manufacturing_runs;
drop policy if exists "org read"  on public.manufacturing_runs;
drop policy if exists "org write" on public.manufacturing_runs;
create policy "org read" on public.manufacturing_runs
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.manufacturing_runs
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- campaigns
drop policy if exists "auth read"  on public.campaigns;
drop policy if exists "auth write" on public.campaigns;
drop policy if exists "org read"  on public.campaigns;
drop policy if exists "org write" on public.campaigns;
create policy "org read" on public.campaigns
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.campaigns
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- campaign_tasks (tenant_id denormalized from campaigns)
drop policy if exists "auth read"  on public.campaign_tasks;
drop policy if exists "auth write" on public.campaign_tasks;
drop policy if exists "org read"  on public.campaign_tasks;
drop policy if exists "org write" on public.campaign_tasks;
create policy "org read" on public.campaign_tasks
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.campaign_tasks
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- campaign_links (tenant_id denormalized from campaigns)
drop policy if exists "auth read"  on public.campaign_links;
drop policy if exists "auth write" on public.campaign_links;
drop policy if exists "org read"  on public.campaign_links;
drop policy if exists "org write" on public.campaign_links;
create policy "org read" on public.campaign_links
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.campaign_links
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

-- products (PK stays id uuid; per-tenant UNIQUEs come from 0019)
drop policy if exists "auth read"  on public.products;
drop policy if exists "auth write" on public.products;
drop policy if exists "org read"  on public.products;
drop policy if exists "org write" on public.products;
create policy "org read" on public.products
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
create policy "org write" on public.products
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )
  with check ( tenant_id in (select public.current_org_ids()) );

----------------------------------------------------------------------
-- Class 2 — MIRRORED: org-scoped read, NO write policy.
-- Tables: qb_financials, shopify_metrics, klaviyo_metrics,
--   qb_revenue_by_channel, hubspot_deals, shopify_inventory,
--   retroship_inventory, sku_sales_history.
--
-- Intentionally NO insert/update/delete policy: with RLS enabled and no
-- permissive write policy, every non-service-role write is denied. Only the
-- RLS-bypassing service-role pullers write these cache tables. Their writes are
-- made tenant-safe in the Phase-2 app PR (explicit tenant_id stamp + .eq filter),
-- NOT here — RLS cannot protect service-role.
----------------------------------------------------------------------

-- qb_financials
drop policy if exists "auth read" on public.qb_financials;
drop policy if exists "org read" on public.qb_financials;
create policy "org read" on public.qb_financials
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- shopify_metrics
drop policy if exists "auth read" on public.shopify_metrics;
drop policy if exists "org read" on public.shopify_metrics;
create policy "org read" on public.shopify_metrics
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- klaviyo_metrics
drop policy if exists "auth read" on public.klaviyo_metrics;
drop policy if exists "org read" on public.klaviyo_metrics;
create policy "org read" on public.klaviyo_metrics
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- qb_revenue_by_channel
drop policy if exists "auth read" on public.qb_revenue_by_channel;
drop policy if exists "org read" on public.qb_revenue_by_channel;
create policy "org read" on public.qb_revenue_by_channel
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- hubspot_deals
drop policy if exists "auth read" on public.hubspot_deals;
drop policy if exists "org read" on public.hubspot_deals;
create policy "org read" on public.hubspot_deals
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- shopify_inventory
drop policy if exists "auth read" on public.shopify_inventory;
drop policy if exists "org read" on public.shopify_inventory;
create policy "org read" on public.shopify_inventory
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- retroship_inventory
drop policy if exists "auth read" on public.retroship_inventory;
drop policy if exists "org read" on public.retroship_inventory;
create policy "org read" on public.retroship_inventory
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

-- sku_sales_history
drop policy if exists "auth read" on public.sku_sales_history;
drop policy if exists "org read" on public.sku_sales_history;
create policy "org read" on public.sku_sales_history
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

----------------------------------------------------------------------
-- Class 3 — PLATFORM: is_platform_admin()-gated read.
-- Tables: slack_notifications, slack_identities.
--
-- Slack is the internal back-office surface, not a merchant surface, so these
-- tables have NO tenant_id. Reads are restricted to the platform-admin allowlist;
-- writes stay service-role (dispatch logger, upsert/delete/auto-link).
--
-- CRITICAL: slack_identities (0004) shipped BOTH "auth read" and the dangerous
-- "auth write" using(true) with check(true) — today ANY authenticated user can
-- rewrite staff Slack->auth.users mappings. Both are dropped here; no replacement
-- write policy is created (service-role does the writes).
----------------------------------------------------------------------

-- slack_identities — drop the read AND the write hole
drop policy if exists "auth read"  on public.slack_identities;
drop policy if exists "auth write" on public.slack_identities;   -- the hole
drop policy if exists "platform read" on public.slack_identities;
create policy "platform read" on public.slack_identities
  for select to authenticated
  using ( (select public.is_platform_admin()) );
-- no write policy: service-role does the upsert/delete/auto-link; admins read only.

-- slack_notifications — was "auth read" using(true)
drop policy if exists "auth read" on public.slack_notifications;
drop policy if exists "platform read" on public.slack_notifications;
create policy "platform read" on public.slack_notifications
  for select to authenticated
  using ( (select public.is_platform_admin()) );
-- no write policy: the service-role dispatch logger writes.

----------------------------------------------------------------------
-- Class 4 — platform-admin cross-tenant READ override.
-- Added to every OWNED + MIRRORED tenant table (17 tables) so internal staff in
-- platform_admins can read across tenants for the /admin back-office.
--
-- Permissive policies OR together: this additional SELECT policy widens reads
-- for admins ONLY, without touching the per-tenant "org read" above. A normal
-- merchant fails is_platform_admin() (the allowlist is empty for them) and still
-- sees only their org; an admin sees everything. READ-ONLY — there is no
-- cross-tenant write override in Phase 1.
--
-- connector_credentials is intentionally excluded: admins must not read raw
-- plaintext secrets via SQL either, so it gets no policy of any kind.
----------------------------------------------------------------------

-- OWNED tables
drop policy if exists "platform cross-tenant read" on public.vendors;
create policy "platform cross-tenant read" on public.vendors
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.purchase_orders;
create policy "platform cross-tenant read" on public.purchase_orders
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.po_line_items;
create policy "platform cross-tenant read" on public.po_line_items
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.po_payments;
create policy "platform cross-tenant read" on public.po_payments
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.manufacturing_runs;
create policy "platform cross-tenant read" on public.manufacturing_runs
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.campaigns;
create policy "platform cross-tenant read" on public.campaigns
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.campaign_tasks;
create policy "platform cross-tenant read" on public.campaign_tasks
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.campaign_links;
create policy "platform cross-tenant read" on public.campaign_links
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.products;
create policy "platform cross-tenant read" on public.products
  for select to authenticated
  using ( (select public.is_platform_admin()) );

-- MIRRORED tables
drop policy if exists "platform cross-tenant read" on public.qb_financials;
create policy "platform cross-tenant read" on public.qb_financials
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.shopify_metrics;
create policy "platform cross-tenant read" on public.shopify_metrics
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.klaviyo_metrics;
create policy "platform cross-tenant read" on public.klaviyo_metrics
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.qb_revenue_by_channel;
create policy "platform cross-tenant read" on public.qb_revenue_by_channel
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.hubspot_deals;
create policy "platform cross-tenant read" on public.hubspot_deals
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.shopify_inventory;
create policy "platform cross-tenant read" on public.shopify_inventory
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.retroship_inventory;
create policy "platform cross-tenant read" on public.retroship_inventory
  for select to authenticated
  using ( (select public.is_platform_admin()) );

drop policy if exists "platform cross-tenant read" on public.sku_sales_history;
create policy "platform cross-tenant read" on public.sku_sales_history
  for select to authenticated
  using ( (select public.is_platform_admin()) );

----------------------------------------------------------------------
-- connector_credentials: deliberately NO policy of any kind.
-- Keeps the 0003 model — RLS enabled, ZERO policies, service-role only. Even
-- platform admins cannot read raw plaintext secrets via SQL. Re-keyed to
-- (tenant_id, connector, key) in 0019; writes stay service-role and must carry
-- an explicit tenant_id / .eq('tenant_id', t) filter (Phase-2, §11).
-- (No statement here by design.)
----------------------------------------------------------------------
