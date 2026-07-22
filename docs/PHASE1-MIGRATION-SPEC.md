# Glow OS — Phase-1 Multi-Tenant Migration Specification (Canonical)

**Status:** authoritative. Supersedes the three competing proposals (Safety-First, RLS-First, Ergonomics).
**Scope:** SQL migration only. Files `0015`–`0021` are **authored, not applied** in this phase.
**Verified against source:** `0001_phase0_init.sql`, `0003_connector_credentials.sql`, `0004_slack_identities.sql`, `0005_products.sql`, `0009`–`0014`. All policy names, PK/UNIQUE constraint names, defaults, and the four cross-tenant time-bombs below were read directly from those files.
**Target:** Postgres 15 on Supabase. PG15 semantics for nullable `ADD COLUMN`, `NOT VALID` constraints, and `CREATE INDEX CONCURRENTLY` are assumed.

---

## 0. The single biggest correctness risk (load-bearing — read first)

The biggest risk is **not the DDL — it is that RLS does not protect any of the writes that matter.** Every MIRRORED write, every AI-tool write from Slack, the two `po_payments` updates, and the `connector_credentials` delete run under the **service-role client, which bypasses RLS entirely.** Four of them are unscoped/full-table mutations. The instant a *second* tenant's rows exist, the first puller run silently destroys or leaks cross-tenant data, and no constraint catches it (PK/FK are satisfied — these are `DELETE`/`UPDATE`s, not `INSERT`s):

| Site | Operation | Hazard |
|---|---|---|
| `lib/pullers/shopify-inventory.ts:125-127` | `.delete().neq('variant_id','')` | wipes the **whole** `shopify_inventory` table every run |
| `lib/pullers/hubspot.ts:136` | full-clear `.delete().neq('id','')` when sync disabled | wipes **all** tenants' deals |
| `lib/pullers/hubspot.ts:207-208` → `:216` | **unscoped** `select('id')` feeding `.delete().in('id', staleIds)` | deletes/leaks other tenants' deals |
| `lib/connectors/credentials.ts:300` | `deleteCredentials()` `.delete().eq('connector', connector)` | one merchant's Disconnect wipes that connector for **all** tenants |
| `app/api/slack/interactivity/route.ts:123-127` & `:157-160` | service-role `update(po_payments)` filtered by `id` only | a Slack action can mark-paid / snooze **any** tenant's payment |

The SQL migration re-keys PKs and adds `tenant_id`, but **it cannot make these safe** — they are app-code filters.

### Neutralization — three layers, in order of importance

1. **Sequencing gate (primary control).** The migration backfills everything to tenant #1 and leaves prod a perfectly valid single-tenant DB. Applying it changes **zero** observable behavior for the existing business — that is what makes it safe to ship to prod *ahead* of the app fixes. **No second `organizations` row may be created, and no second Shopify install onboarded, until the Phase-2 app PR (§11) lands every `.eq('tenant_id', t)` filter and every explicit-stamp.** With exactly one tenant, every unscoped delete/update is harmless.

2. **DB tripwire (belt-and-suspenders, shipped in the same set).** A `BEFORE INSERT` trigger on `organizations` raises unless the GUC `app.allow_second_tenant` is set, making "onboard tenant #2 before the deletes are scoped" *physically impossible* rather than merely discouraged. Defined in `0015` (§7).

3. **Make the failure mode loud, not silent.** `tenant_id` is `NOT NULL` + FK on every tenant table, so any service-role insert that forgets `tenant_id` throws at the first row instead of writing a NULL-tenant orphan. Re-keying MIRRORED PKs to `(tenant_id, …)` means a puller upsert that forgets `tenant_id` errors on the `onConflict` target rather than silently overwriting tenant #1's row. The merchant JWT surface is airtight by construction (`WITH CHECK` + `current_org_ids()`); the residual risk lives **only** in the service-role zone, and layers 1+2 reduce it to zero during the unsafe window.

**Schema is necessary but not sufficient; the cutover gate is what prevents data loss.**

---

## 1. New platform tables (file `0015`)

These tables are empty, so ordinary `CREATE` is safe — no lock concern.

```sql
-- Enum: owner/admin/member is a small, stable set -> a true enum.
-- Guarded because CREATE TYPE has no IF NOT EXISTS.
do $$ begin
  create type public.org_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  shop_domain text,                               -- e.g. 'glow.myshopify.com'; nullable (seed org may predate install), UNIQUE
  slug        text not null,                      -- deterministic seed handle; backfill anchor, never a literal UUID
  name        text not null,
  plan        text not null default 'standard',   -- text, NOT enum: billing tiers churn -> avoid ALTER TYPE friction
  status      text not null default 'active',     -- active | suspended | cancelled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organizations_shop_domain_key unique (shop_domain),  -- multiple NULLs allowed under plain UNIQUE
  constraint organizations_slug_key        unique (slug)
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();   -- reuse existing 0001 helper

create table if not exists public.memberships (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id)           on delete cascade,
  role       public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)                  -- one role per (org,user); natural idempotent upsert key
);
create index if not exists memberships_user_id_idx
  on public.memberships (user_id);               -- current_org_ids() filters by user_id -> index scan

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);
```

**Design decisions (resolved across all three proposals):**

- `shop_domain` is **nullable but UNIQUE** (grafted from Ergonomics): the seeded Glow org may not have its `.myshopify.com` confirmed at migration time; every future install sets it. PG allows multiple NULLs under a plain UNIQUE, so no partial index is needed. It is the install-time idempotency key (re-install must not create a second org).
- `slug` is `not null unique` and is the **deterministic backfill anchor** — every backfill in §3 references `(select id from public.organizations where slug = 'glow')`, never a literal UUID (decoupled from environment-specific ids).
- `plan`/`status` are `text`, **not enums** (unanimous): billing states churn; an enum forces `ALTER TYPE ADD VALUE` migrations later (the 0008 `po_status` lesson). `org_role` **is** an enum because owner/admin/member is small and stable.
- `memberships` PK `(org_id, user_id)` is the membership-resolution index for free; `memberships_user_id_idx` makes the `current_org_ids()` lookup an index scan.
- `memberships` is **internal-staff-only**. Merchants get their org from the JWT `org_id` claim (§2), never a membership row. In Phase 1 this table is near-empty; it exists so the helper's union branch is real, not vaporware.
- `platform_admins` is a bare `user_id` allowlist gating the `/admin` back-office surface.

**RLS on the platform tables themselves (defined in `0015`, after the helpers in §2):**

```sql
alter table public.organizations  enable row level security;
alter table public.memberships    enable row level security;
alter table public.platform_admins enable row level security;

-- organizations: a member reads their own org; platform admins read all; writes are platform-admin only
-- (install flow uses service-role, which bypasses RLS).
create policy "org read self" on public.organizations for select to authenticated
  using ( id in (select public.current_org_ids()) or (select public.is_platform_admin()) );
create policy "org admin write" on public.organizations for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );

-- memberships: a user reads their own rows; platform admins read/write all.
create policy "membership read self" on public.memberships for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_platform_admin()) );
create policy "membership admin write" on public.memberships for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );

-- platform_admins: admins read/write the allowlist; nobody else sees it.
-- BOOTSTRAP NOTE: the FIRST admin row must be inserted by service-role (chicken-and-egg);
-- seeded in 0015 (§7).
create policy "platform_admins admin all" on public.platform_admins for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );
```

---

## 2. Helper functions (file `0015`)

Both are `SECURITY DEFINER`, `STABLE`, with a pinned `search_path`. `SECURITY DEFINER` is required so the functions can read `platform_admins`/`memberships` regardless of the caller's own (restrictive) RLS, and so they don't recursively trigger the very policies they back. **Resolved conflict:** pin `search_path = public, pg_temp` (RLS-First/Ergonomics form) — including `pg_temp` last is the Postgres-recommended hardening against search-path hijack for `SECURITY DEFINER`.

```sql
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- (a) merchant surface: org_id minted into the Supabase JWT at the Shopify-session bridge
  select (auth.jwt() ->> 'org_id')::uuid
  where  nullif(auth.jwt() ->> 'org_id', '') is not null
  union
  -- (b) internal staff surface: every org the Supabase-authed user is a member of
  select m.org_id
  from   public.memberships m
  where  m.user_id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins p
    where p.user_id = auth.uid()
  );
$$;

grant execute on function public.current_org_ids()  to authenticated, anon;
grant execute on function public.is_platform_admin() to authenticated, anon;
```

**Design decisions (justified):**

- **How `current_org_ids()` reads the claim:** `auth.jwt() ->> 'org_id'` (the supported Supabase wrapper, already null-safe — preferred over hand-rolling `current_setting('request.jwt.claims')` for the *function* body). `auth.jwt()` returns `'{}'::jsonb` for an unauthenticated/service-role request, so the `where nullif(...) is not null` guard yields **an empty set rather than a NULL row or an error.** A NULL in the set would make `tenant_id in (select current_org_ids())` behave unpredictably; emitting no rows means the policy **denies everything** — fail-closed. The `::uuid` cast is applied only to the surviving non-empty value; a *malformed* `org_id` SHOULD throw (we deliberately do not swallow that).
- **Union with memberships:** merchants carry the claim and have no membership rows; staff authenticate via Supabase Auth (no `org_id` claim) and resolve through `memberships`. `union` (not `union all`) dedupes the rare case where a staff user is also a member of the org named in a claim. Returning `setof uuid` lets policies write `tenant_id in (select current_org_ids())` — the planner-friendliest form, and serves both single-org merchants and multi-org staff.
- **`STABLE`, not `VOLATILE`:** the result is constant within a statement, so the planner may evaluate it once and cache. This is the key to RLS performance.
- **`(SELECT …)` wrapping in policy bodies is MANDATORY, not stylistic.** Always write `tenant_id in (SELECT public.current_org_ids())` and `(SELECT public.is_platform_admin())`. Wrapping a `STABLE` function call in a subselect lets Postgres treat it as an **InitPlan** evaluated **once per query** instead of once per row. Without the wrapper, a sequential scan of N rows calls the function N times — fatal on `shopify_inventory`/`hubspot_deals`/`sku_sales_history`-sized scans. Every policy template in §5 uses the wrapper.
- **`SECURITY DEFINER` + pinned `search_path`:** prevents both RLS recursion and search-path hijack. `GRANT EXECUTE` to `authenticated` and `anon` (anon simply gets empty/false). The function — not a table grant — is what lets policies read `memberships`/`platform_admins` without exposing those tables directly.

---

## 3. Adding `tenant_id` to live populated tables without downtime

Tenant-scoped tables (19 total): the **9 OWNED** (`vendors`, `purchase_orders`, `po_line_items`, `po_payments`, `manufacturing_runs`, `campaigns`, `campaign_tasks`, `campaign_links`, `products`), the **8 MIRRORED** (`qb_financials`, `shopify_metrics`, `klaviyo_metrics`, `qb_revenue_by_channel`, `hubspot_deals`, `shopify_inventory`, `retroship_inventory`, `sku_sales_history`), plus **`connector_credentials`** (OWNED-classed, see §6). `slack_notifications` and `slack_identities` are **NOT** tenant-scoped (§6).

### Exact per-table ordering (every step lock-light on PG15)

1. **`ALTER TABLE t ADD COLUMN IF NOT EXISTS tenant_id uuid;`** — nullable, **no default, no FK in this step.** A nullable add with no default is a metadata-only catalog change in PG11+: instant, `ACCESS EXCLUSIVE` held for microseconds, no table rewrite. (A `NOT NULL DEFAULT <const>` would also be metadata-only, but a default that reads the JWT is **not** constant — it would rewrite. That is precisely why the JWT default is added later, step 5.)

2. **Backfill** to the seed org by subselect:
   ```sql
   update public.t
      set tenant_id = (select id from public.organizations where slug = 'glow')
    where tenant_id is null;
   ```
   `WHERE tenant_id IS NULL` makes the backfill **re-runnable and batchable**. Takes only row locks, not a table lock. For **denormalized child tables**, backfill **from the parent** so the value is provably consistent, and backfill parents before children:
   ```sql
   update public.po_payments p
      set tenant_id = po.tenant_id
     from public.purchase_orders po
    where p.purchase_order_id = po.id and p.tenant_id is null;
   ```
   Same pattern for `po_line_items` (from `purchase_orders`), `campaign_tasks` and `campaign_links` (from `campaigns`).

3. **Post-backfill assertion** (grafted from RLS-First — abort loudly before `SET NOT NULL`):
   ```sql
   do $$ begin
     if exists (select 1 from public.t where tenant_id is null) then
       raise exception 'backfill incomplete for t: % null rows',
         (select count(*) from public.t where tenant_id is null);
     end if;
   end $$;
   ```

4. **Make `tenant_id` NOT NULL via the NOT-VALID-CHECK → VALIDATE path** (resolved conflict — adopt the Safety-First lock-light path as the authored default; it is strictly safer and the assertion in step 3 guarantees it passes):
   ```sql
   alter table public.t add constraint t_tenant_not_null check (tenant_id is not null) not valid;  -- instant, no scan
   alter table public.t validate constraint t_tenant_not_null;                                     -- SHARE UPDATE EXCLUSIVE, non-blocking
   alter table public.t alter column tenant_id set not null;                                        -- PG12+ skips the scan (validated CHECK proves it)
   alter table public.t drop constraint t_tenant_not_null;                                          -- drop the now-redundant CHECK
   ```
   *Rationale for resolving in favor of Safety-First:* although these tables are tiny single-tenant today (so a plain `SET NOT NULL` scan is also fine), the `NOT VALID → VALIDATE` path takes only `SHARE UPDATE EXCLUSIVE` (does not block reads/writes) and is the pattern that scales when tenant #2's data makes a table large. We author the safe form once.

5. **Add the FK to `organizations`, also `NOT VALID` first:**
   ```sql
   alter table public.t add constraint t_tenant_id_fkey
     foreign key (tenant_id) references public.organizations(id) on delete restrict not valid;  -- instant; enforces on all NEW rows
   alter table public.t validate constraint t_tenant_id_fkey;                                    -- SHARE UPDATE EXCLUSIVE, non-blocking
   ```
   `ON DELETE RESTRICT` is deliberate (unanimous): never let a tenant delete cascade-wipe operational data implicitly. Org teardown is a separate, deliberate operation.

6. **Add the JWT-claim DEFAULT LAST** (decision in §3a). Metadata-only; applies only to future inserts. Existing rows are already backfilled, so no rewrite. Adding it *after* backfill is mandatory: a JWT-reading default during backfill would either rewrite the table or stamp wrong values for the migration's own session (which has no `org_id` claim).

7. **Create new tenant-scoped composite indexes / `tenant_id` indexes `CONCURRENTLY`** (file `0018`, §4). For OWNED tables add `t_tenant_id_idx (tenant_id)` so RLS predicates filter on an index; MIRRORED tables get `tenant_id` into their composite PK instead (§4). `CREATE INDEX CONCURRENTLY` cannot run inside a transaction → isolated to its own file.

8. **Re-key PK / UNIQUE** (file `0019`, §4) — last, after `tenant_id` is `NOT NULL` (PK columns are implicitly NOT NULL; a NULL would fail the PK build).

9. **RLS rewrite** (file `0020`, §5) — dead last, after every row has a valid `tenant_id`, so the moment policies flip on there is no row that fails the predicate.

### 3a. The JWT-claim column DEFAULT — DECISION: ADD IT as a safety net, but require explicit `tenant_id` in ALL service-role code

The default expression (use the raw GUC read in the *column default* — robust regardless of `auth` schema grants):

```sql
alter table public.t
  alter column tenant_id set default
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid;
```

`current_setting(..., true)` returns NULL (not error) when the GUC is unset; `nullif(...,'')` guards the empty-string case; `->>` yields NULL when there is no `org_id`. Combined with `tenant_id NOT NULL`, a merchant insert with no claim **fails loudly with a NOT-NULL violation** rather than silently stamping an empty/wrong tenant. That fail-closed behavior is the goal.

**Where the default fires — exactly one surface:** the in-app merchant path under the RLS client — `app/api/chat/route.ts:18` (RLS client, `actorUserId=null`) and the RLS-client server actions in `lib/actions/*`, e.g. `campaign_links` at `lib/actions/campaigns.ts:180` (inserts `parsed.data` directly), `campaign_tasks` at `:109`. Those inserts need **zero code change**.

**Where the default does NOTHING (must pass `tenant_id` explicitly):**
- (a) any service-role puller (`lib/pullers/*` — no JWT);
- (b) the **service-role AI-tool path from Slack** — `app/api/slack/events/route.ts:91` and `commands/route.ts:58` use `createServiceClient()` with no `org_id` claim, so the default returns NULL → NOT-NULL violation (correct/loud, not a silent wrong-tenant write). Threads through `GlowToolCtx` to `lib/ai/tools.ts:469` (`createRunCore`), `:709` (`createCampaignCore`), `:736` (`addCampaignTask`);
- (c) the `po_payments` service-role updates;
- (d) `connector_credentials`;
- (e) the cron product sync `app/api/sync/shopify-products/route.ts:14` (`actorUserId=null`, no JWT).

**Why hybrid beats either pure approach:** pure-default is a trap — it lulls you into thinking inserts are covered when the entire Slack/service-role surface (the majority of AI-tool writes) silently isn't. Pure-explicit-everywhere is more honest but loses the merchant safety net and forces editing ~10 merchant-surface insert sites the default handles for free. **Conclusion:** ship the default as belt-and-suspenders for the merchant RLS surface; treat it as **non-load-bearing** in the Phase-2 checklist — every service-role write site gets an explicit `tenant_id` regardless. One subtlety to document: a column default is **not** applied on `INSERT (col-list omitting tenant_id) ON CONFLICT DO UPDATE` where supabase-js sends an explicit column set — so the default only fires for inserts that genuinely omit the column. That is fine; it is why the default is a safety net, not a mechanism.

### 3b. Drop the six `auth.uid()` defaults on `created_by`/`updated_by`

Verified columns: `vendors.created_by`, `purchase_orders.created_by`, `manufacturing_runs.created_by`, `campaigns.created_by`, `products.created_by`, and `connector_credentials.updated_by`. Merchants have no `auth.uid()` (Shopify session), so the default yields NULL there anyway, and keeping it invites confusion. They are already nullable, so dropping the default is metadata-only and conflict-free. Treat these as best-effort staff audit columns (stamp from app where a staff user exists; NULL for merchant-originated rows). Done in file `0021`.

```sql
alter table public.vendors              alter column created_by drop default;
alter table public.purchase_orders      alter column created_by drop default;
alter table public.manufacturing_runs   alter column created_by drop default;
alter table public.campaigns            alter column created_by drop default;
alter table public.products             alter column created_by drop default;
alter table public.connector_credentials alter column updated_by drop default;
```

---

## 4. Re-keying mirrored PKs and per-tenant UNIQUE constraints (files `0018` + `0019`)

Two distinct shapes. Both build the new index `CONCURRENTLY` in `0018` (non-transactional), then do a tiny exclusive constraint swap in `0019`.

### (A) Re-key the PK — 8 MIRRORED tables + `connector_credentials`

| Table | Current PK | New PK |
|---|---|---|
| `qb_financials` | `as_of_date` | `(tenant_id, as_of_date)` |
| `shopify_metrics` | `as_of_date` | `(tenant_id, as_of_date)` |
| `klaviyo_metrics` | `as_of_date` | `(tenant_id, as_of_date)` |
| `qb_revenue_by_channel` | `as_of_date` | `(tenant_id, as_of_date)` |
| `hubspot_deals` | `id` (text) | `(tenant_id, id)` |
| `shopify_inventory` | `variant_id` (text) | `(tenant_id, variant_id)` |
| `retroship_inventory` | `(sku, warehouse)` | `(tenant_id, sku, warehouse)` |
| `sku_sales_history` | `(sku, month)` | `(tenant_id, sku, month)` |
| `connector_credentials` | `(connector, key)` | `(tenant_id, connector, key)` |

`tenant_id` goes **first** in the composite so existing single-tenant data clusters and `where tenant_id = …` scans get a prefix.

**`0018` (build the index, no table lock, outside a txn):**
```sql
create unique index concurrently if not exists qb_financials_pkey_new
  on public.qb_financials (tenant_id, as_of_date);
```

**`0019` (swap the PK in a short txn, adopting the prebuilt index — guarded for re-runnability):**
```sql
do $$ begin
  alter table public.qb_financials drop constraint qb_financials_pkey;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.qb_financials
    add constraint qb_financials_pkey primary key using index qb_financials_pkey_new;
exception when duplicate_table then null; end $$;
```
`ADD PRIMARY KEY USING INDEX` adopts the already-built `CONCURRENTLY` index, so the `ACCESS EXCLUSIVE` window is the **catalog swap only — no data scan.** The verified existing PK constraint name is the PG-implicit `<table>_pkey` for every one of these (confirmed: none was named explicitly in `0001`/`0009`/`0012`/`0013`/`0014`/`0003`).

### (B) Re-key the two per-tenant UNIQUEs on `products` (PK stays `id uuid`)

Verified in `0005`: `sku text unique` (constraint `products_sku_key`) and `shopify_product_id text unique` (constraint `products_shopify_product_id_key`), both independent single-column, both nullable. **BOTH re-key.** PK `id` is unchanged because `manufacturing_runs.product_id` FKs to it (we do not touch that FK).

**Resolved conflict (partial vs plain composite index):** use a **plain composite unique index**, NOT a partial `WHERE … is not null`. Standard SQL NULL-distinct semantics already allow multiple NULL rows per tenant under a plain composite unique (two NULLs are never "equal"), so the partial predicate adds nothing and would make the index unusable as an `ON CONFLICT` arbiter for non-null upserts in some planners. A plain composite is the correct, simplest `onConflict` target for `lib/products/core.ts:184`.

**`0018`:**
```sql
create unique index concurrently if not exists products_tenant_sku_key
  on public.products (tenant_id, sku);
create unique index concurrently if not exists products_tenant_shopify_pid_key
  on public.products (tenant_id, shopify_product_id);
```

**`0019`:**
```sql
do $$ begin alter table public.products drop constraint products_sku_key;             exception when undefined_object then null; end $$;
do $$ begin alter table public.products drop constraint products_shopify_product_id_key; exception when undefined_object then null; end $$;

do $$ begin
  alter table public.products add constraint products_tenant_sku_key        unique using index products_tenant_sku_key;
exception when duplicate_table then null; end $$;
do $$ begin
  alter table public.products add constraint products_tenant_shopify_pid_key unique using index products_tenant_shopify_pid_key;
exception when duplicate_table then null; end $$;
```
**Critical coupling:** `(tenant_id, shopify_product_id)` is the `onConflict` target the Phase-2 upsert (`lib/products/core.ts:184`) depends on — `ON CONFLICT` requires the matching unique index to **exist** before the app changes `onConflict` to `'tenant_id,shopify_product_id'`. The index must be live (this migration) **before** the app PR ships. Same logic for every mirrored upsert in §11.

### FK-vs-rekey ordering (the real trap, verified safe)

None of the re-keyed tables is an FK **target**:
- The OWNED uuid PKs are **not changing** (`products.id`, `purchase_orders.id`, `campaigns.id`, etc. stay), so the child FKs (`po_line_items.purchase_order_id` CASCADE, `po_payments.purchase_order_id` CASCADE, `campaign_tasks.campaign_id` CASCADE, `campaign_links.campaign_id` CASCADE, `manufacturing_runs.{vendor_id RESTRICT, purchase_order_id SET NULL, product_id SET NULL}`) are untouched. Children get `tenant_id` **denormalized** (backfilled from parent, §3) but keep their existing FKs — this is *why* we denormalize: so RLS evaluates locally without a join.
- The MIRRORED tables whose PKs change are **leaf cache tables** with no inbound FKs.

**Precondition the migration must verify (not author on faith)** — include this query result as a header comment in `0019`:
```sql
select conrelid::regclass as child, confrelid::regclass as parent, conname
from   pg_constraint
where  contype = 'f'
and    confrelid in (
  'public.qb_financials'::regclass, 'public.shopify_metrics'::regclass,
  'public.klaviyo_metrics'::regclass, 'public.qb_revenue_by_channel'::regclass,
  'public.hubspot_deals'::regclass, 'public.shopify_inventory'::regclass,
  'public.retroship_inventory'::regclass, 'public.sku_sales_history'::regclass,
  'public.connector_credentials'::regclass, 'public.products'::regclass
);
-- Expected: zero rows. If any row appears, that inbound FK must be dropped ->
-- parent PK swapped -> FK recreated against the new composite key, in that order.
```

---

## 5. RLS rewrite (file `0020`)

RLS is permissive-OR'd. Drop the old `using(true)` policies **by their exact verified names** and add scoped ones in the same migration. Every helper call is wrapped in `(SELECT …)` for InitPlan caching. Drops use `drop policy if exists` (idempotent).

### Class 1 — OWNED: org-scoped read + write
Tables: `vendors`, `purchase_orders`, `po_line_items`, `po_payments`, `manufacturing_runs`, `campaigns`, `campaign_tasks`, `campaign_links`, `products`. **Template (apply per table):**
```sql
drop policy if exists "auth read"  on public.vendors;
drop policy if exists "auth write" on public.vendors;

create policy "org read" on public.vendors
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );

create policy "org write" on public.vendors
  for all to authenticated
  using      ( tenant_id in (select public.current_org_ids()) )   -- rows you may target (UPDATE/DELETE)
  with check ( tenant_id in (select public.current_org_ids()) );  -- tenant_id you may create/leave behind
```
The `WITH CHECK` is the airtight part: even if app code (or a bypassed default) tries to insert/move a row into another tenant, it is rejected. A merchant **cannot** write outside their org. (`products` keeps PK `id`; its per-tenant UNIQUEs come from §4(B).)

### Class 2 — MIRRORED: org-scoped read, NO write policy
Tables: `qb_financials`, `shopify_metrics`, `klaviyo_metrics`, `qb_revenue_by_channel`, `hubspot_deals`, `shopify_inventory`, `retroship_inventory`, `sku_sales_history`. **Template:**
```sql
drop policy if exists "auth read" on public.shopify_metrics;

create policy "org read" on public.shopify_metrics
  for select to authenticated
  using ( tenant_id in (select public.current_org_ids()) );
-- intentionally NO insert/update/delete policy:
-- with RLS enabled and no permissive write policy, every non-service-role write is denied.
-- Only service-role (RLS-bypassing) pullers write.
```

### Class 3 — PLATFORM: `is_platform_admin()`-gated
Tables: `slack_notifications`, `slack_identities`. **CRITICAL:** `slack_identities` (0004) has BOTH `"auth read"` and the dangerous `"auth write"` `using(true) with check(true)` — today **any** authenticated user can rewrite staff mappings. Drop both.
```sql
-- slack_identities
drop policy if exists "auth read"  on public.slack_identities;
drop policy if exists "auth write" on public.slack_identities;   -- the hole
create policy "platform read" on public.slack_identities
  for select to authenticated
  using ( (select public.is_platform_admin()) );
-- no write policy: service-role does the upsert/delete/auto-link; admins read only.

-- slack_notifications (was "auth read" using(true))
drop policy if exists "auth read" on public.slack_notifications;
create policy "platform read" on public.slack_notifications
  for select to authenticated
  using ( (select public.is_platform_admin()) );
-- no write policy: service-role dispatch logger writes.
```

### Class 4 — platform-admin cross-tenant READ override (additional permissive SELECT)
Add to **every OWNED and MIRRORED tenant table** (17 tables) so internal staff in `platform_admins` read across tenants for the `/admin` back-office. Permissive policies OR, so this widens reads for admins only without touching the tenant policy. **Read-only — no cross-tenant write override in Phase 1.**
```sql
create policy "platform cross-tenant read" on public.vendors
  for select to authenticated
  using ( (select public.is_platform_admin()) );
```
A normal merchant fails `is_platform_admin()` (empty allowlist for them) and sees only their org; an admin sees everything. `connector_credentials` deliberately gets **NO policy of any kind** (§6) — admins cannot read raw secrets via SQL either.

---

## 6. `slack_*` and `connector_credentials` decisions (resolved)

### `connector_credentials` → tenant-OWNED *data*, accessed *like* PLATFORM (RLS-enabled, ZERO policies)
This resolves the OWNED-vs-PLATFORM tension explicitly. The data is **per-shop** (each merchant has its own Shopify/QB/HubSpot/Klaviyo creds; platform/Slack secrets live in env, not this table) → it **is** tenant data → re-key PK to `(tenant_id, connector, key)` now (§4(A)), so one merchant's `('shopify','token')` can't collide with another's. **But** the values are **plaintext secrets** (Vault is Phase 3) → it must NOT gain a merchant-facing read policy. Therefore:
- Add `tenant_id` per §3; re-key PK per §4(A).
- **Keep the 0003 model exactly: RLS enabled, ZERO policies, service-role only.** Add **no** `org read`/`org write` and **no** Class-4 cross-tenant admin read.
- Drop the `updated_by` `auth.uid()` default (§3b).
- **Gate-critical Phase-2 fix:** `deleteCredentials()` (`lib/connectors/credentials.ts:300`) must add `.eq('tenant_id', t)` — it is a cross-tenant wipe (§11).

### `slack_notifications` + `slack_identities` → PLATFORM, NO `tenant_id`
Slack is the **internal back-office** surface (locked architecture decision #2), not a merchant surface.
- `slack_identities` maps Slack users to internal **staff** `auth.users` (FK `supabase_user_id → auth.users ON DELETE CASCADE`, verified 0004) — it has no tenant meaning. Tenant-scoping it would model a relationship that doesn't exist.
- `slack_notifications` is the internal outbound-dedupe log.
- Both get Class-3 treatment (§5): drop `using(true)` policies, gate reads via `is_platform_admin()`, **and drop the 0004 `"auth write"` hole.** Writes stay service-role (`lib/actions/slack-identities.ts:53/84`, `lib/slack/identity.ts:62`, `lib/slack/dispatch.ts:46`).
- `slack_notifications.dedupe_key` stays **globally UNIQUE** (single Slack workspace today); revisit a tenant-prefixed key only if notifications ever go per-merchant — an app-code concern, not Phase-1 schema.
- `slack_identities` `onConflict` key **STAYS `'slack_user_id'`** (no change) — do not "fix" it.

---

## 7. Seeding tenant #1 + the second-tenant tripwire (file `0015`)

Idempotent, referenced by subselect — never a hardcoded UUID:
```sql
insert into public.organizations (shop_domain, slug, name, plan, status)
values ('glow.myshopify.com', 'glow', 'Glow', 'standard', 'active')  -- confirm real shop_domain before authoring; may seed NULL and set later
on conflict (slug) do nothing;
```
`ON CONFLICT (slug) DO NOTHING` → re-running is a no-op; the `slug` UNIQUE guarantees exactly one Glow org. Every backfill (§3 step 2) reads `(select id from public.organizations where slug = 'glow')`.

**Seed staff access (so the two existing internal users keep access through the new policies)** — author against the real user emails; idempotent:
```sql
insert into public.platform_admins (user_id)
select id from auth.users where email in ('paul@corso.com' /*, second staff email */)
on conflict (user_id) do nothing;

insert into public.memberships (org_id, user_id, role)
select (select id from public.organizations where slug = 'glow'), u.id, 'owner'
from auth.users u where u.email in ('paul@corso.com' /*, second staff email */)
on conflict (org_id, user_id) do nothing;
```
The first `platform_admins` insert is the bootstrap (chicken-and-egg) — it runs in the migration under service-role/superuser, before any `is_platform_admin()`-gated write policy could block it.

**Second-tenant tripwire (the §0 layer-2 control):**
```sql
create or replace function public.guard_second_tenant()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.organizations) >= 1
     and coalesce(current_setting('app.allow_second_tenant', true), 'off') <> 'on' then
    raise exception
      'Refusing to create a second organization: Phase-2 tenant-scoping not confirmed. '
      'Set app.allow_second_tenant=on in this session only after the cross-tenant '
      'delete/update fixes (PHASE1-MIGRATION-SPEC §11) have shipped.';
  end if;
  return new;
end $$;

create trigger organizations_guard_second_tenant
  before insert on public.organizations
  for each row execute function public.guard_second_tenant();
```
*Ordering note:* create this trigger **after** the §7 seed insert (or the seed itself trips it). Author the seed first, the trigger last, within `0015`.

---

## 8. File split & ordering (0015–0021)

**Resolved conflict (6 vs 7 files):** adopt the **7-file split** (RLS-First). Separating OWNED `tenant_id` (`0016`) from MIRRORED `tenant_id` (`0017`), and isolating the `created_by`-default drop (`0021`), gives each risky/independent concern its own reviewable, independently-revertible transaction with a coherent failure boundary. The split is driven by lock profile and the `CREATE INDEX CONCURRENTLY` transaction-boundary rule. Supabase applies each file as its own transaction; the concurrent-index file must stand alone (authored with no surrounding `BEGIN`).

| File | Contents | Txn? |
|---|---|---|
| **`0015_tenancy_core.sql`** | `org_role` enum (guarded); `organizations`, `memberships`, `platform_admins` + indexes + `organizations` `updated_at` trigger + their RLS; helpers `current_org_ids()`/`is_platform_admin()` + grants; **seed Glow org → seed platform_admin/memberships → second-tenant tripwire trigger** (in that order). All instant/empty-table. | single txn |
| **`0016_tenant_id_owned.sql`** | For the 9 OWNED tables: `ADD COLUMN tenant_id` (nullable) → backfill (parents before children) → assertion → NOT-VALID-CHECK→VALIDATE→SET NOT NULL→drop CHECK → FK `NOT VALID`+`VALIDATE` → JWT default. No PK/index changes. | single txn |
| **`0017_tenant_id_mirrored.sql`** | Same add/backfill/assert/notnull/FK/default sequence for the 8 MIRRORED tables **+ `connector_credentials`**. No PK changes. | single txn |
| **`0018_indexes.sql`** | All `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` for the new composite PKs (`*_pkey_new`), the two `products` uniques, plus `t_tenant_id_idx` on each OWNED table. **No statement of any other kind.** | **NON-transactional** (no `BEGIN`) |
| **`0019_rekey_pks_uniques.sql`** | Guarded `drop constraint` / `add … using index` swaps for the 9 PK re-keys and the 2 `products` uniques. Tiny exclusive windows. Header carries the §4 `pg_constraint` precondition query result. | single txn |
| **`0020_rls_policies.sql`** | Drop all `using(true)` policies (incl. `slack_identities` `"auth write"`); create Class 1 (OWNED RW), Class 2 (MIRRORED read), Class 3 (PLATFORM admin read), Class 4 (admin cross-tenant read). `connector_credentials` left policy-less. | single txn |
| **`0021_drop_created_by_defaults.sql`** | `ALTER COLUMN … DROP DEFAULT` on the six `created_by`/`updated_by` columns (§3b). | single txn |

**Strict order: 0015 → 0021.** `0018` must precede `0019` (the swaps adopt `0018`'s indexes). RLS (`0020`) flips last so policies never see a partially-tenanted table. No `ALTER TYPE ADD VALUE` occurs in Phase 1 (only the fresh `org_role` enum), so the 0008 hazard does not recur.

---

## 9. Idempotency / re-runnability / prod-safety

- **`IF EXISTS`/`IF NOT EXISTS` everywhere:** `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT … DO NOTHING` for all seeds. `CREATE TYPE org_role` wrapped in `do $$ … exception when duplicate_object $$` (no `IF NOT EXISTS` for types).
- **Backfills are `WHERE tenant_id IS NULL`** → re-running stamps only still-null rows; otherwise a no-op. Never overwrites a real `tenant_id`.
- **Constraint swaps are the one non-idempotent spot** → each `drop constraint` / `add … using index` is wrapped in `do $$ … exception when undefined_object / duplicate_table then null $$` (shown in §4) so re-running `0019` after a partial failure does not error.
- **`CONCURRENTLY` interrupted-build recovery:** a failed concurrent build leaves an `INVALID` index that `IF NOT EXISTS` will NOT rebuild. `0018`'s header documents: `DROP INDEX IF EXISTS <name>` the invalid `_new`/`_key` index first, then re-run. `0018` must be applied with autocommit / no surrounding `BEGIN`.
- **Failure isolation:** each risky op is its own file/transaction, so a mid-apply failure leaves the DB in a known prior-file state; re-applying from the failed file forward is safe due to the guards.
- **No table rewrites, no blocking validations on populated tables** — the entire point of the nullable-add, NOT-VALID→VALIDATE, and CONCURRENTLY→swap patterns.
- **Author only — do NOT apply** in this phase. Apply against a Supabase branch/staging clone first. On prod the set is **behavior-preserving** (single tenant; all rows → Glow org; RLS resolves Glow for existing staff via `memberships`). Recommended apply order on prod: `0015` (additive, zero risk) → `0016`/`0017` (backfill, observe assertions) → `0018` (off-peak; CONCURRENTLY is online but I/O-heavy) → `0019` (brief constraint locks, off-peak) → `0020`/`0021`. Per project memory, apply through the dashboard SQL editor / configured runner (no Supabase CLI).

---

## 10. Files to author (none applied)

```
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0015_tenancy_core.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0016_tenant_id_owned.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0017_tenant_id_mirrored.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0018_indexes.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0019_rekey_pks_uniques.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0020_rls_policies.sql
/Users/PaulBart/Projects/GLOW OS/glow-os/supabase/migrations/0021_drop_created_by_defaults.sql
```

---

## 11. Phase-2 app-code checklist (hand-off — do NOT edit in this workflow)

**GATE: no second `organizations` row (and no `app.allow_second_tenant=on`) until ALL of these land.** Each migration file carries the relevant entries as header comments so schema and app obligations travel together.

**`onConflict` re-keys (service-role; rows must carry explicit `tenant_id`):**
- `lib/pullers/shopify.ts:475` — `shopify_metrics` `'as_of_date'` → `'tenant_id,as_of_date'`
- `lib/pullers/quickbooks.ts:471` — `qb_financials` → `'tenant_id,as_of_date'`
- `lib/pullers/quickbooks.ts:492` — `qb_revenue_by_channel` → `'tenant_id,as_of_date'`
- `lib/pullers/klaviyo.ts:59` — `klaviyo_metrics` → `'tenant_id,as_of_date'`
- `lib/pullers/hubspot.ts:198` — `hubspot_deals` `'id'` → `'tenant_id,id'`
- `lib/pullers/shopify-sales-history.ts:134` — `sku_sales_history` `'sku,month'` → `'tenant_id,sku,month'`
- `lib/products/core.ts:184` — `products` `'shopify_product_id'` → `'tenant_id,shopify_product_id'`
- `lib/connectors/credentials.ts:285` — `connector_credentials` `'connector,key'` → `'tenant_id,connector,key'`

**Cross-tenant deletes/selects to scope with `.eq('tenant_id', t)` (the §0 time-bombs):**
- `lib/pullers/shopify-inventory.ts:125-127` (full-replace delete) **+ stamp insert `:133`**
- `lib/pullers/hubspot.ts:136` (full-clear) AND `:207-208` (scope the `select('id')`) AND `:216` (stale-row delete)
- `lib/connectors/credentials.ts:300` (`deleteCredentials`)

**`po_payments` service-role updates — add `.eq('tenant_id', t)`:**
- `app/api/slack/interactivity/route.ts:123-127` (mark-paid) and `:157-160` (snooze)
- `po_payments.tenant_id` is backfilled in SQL from parent `purchase_orders`; the future insert path must stamp it (no insert site exists today).

**Thread `tenant_id` through `GlowToolCtx` and stamp explicitly on every AI-tool OWNED write (Slack path is service-role; JWT default will NOT fire):**
- `lib/ai/tools.ts:469` (`createRunCore` → `manufacturing_runs`), `:709` (`createCampaignCore` → `campaigns` + template `campaign_tasks` via `lib/campaigns/core.ts:62`), `:736` (`addCampaignTask` → `campaign_tasks`)

**Resolve + pass `tenant_id` in the cron product sync:**
- `app/api/sync/shopify-products/route.ts:14` (`runShopifyProductSync(supabase, null)` — `actorUserId=null`, no JWT/staff user)

**Merchant RLS-surface inserts (JWT default covers these, but verify):**
- `lib/actions/campaigns.ts:180` (inserts `parsed.data` directly — must add `tenant_id` if default ever bypassed), `:109`; denormalized child inserts `po_line_items` (`lib/purchase-orders/core.ts:132`), `campaign_tasks`, `campaign_links`.

**Other:**
- Gate the `slack-identities` server action behind `is_platform_admin()`; confirm `created_by`/`updated_by` stamping is best-effort (NULL for merchants). `slack_identities` `onConflict 'slack_user_id'` stays unchanged.

---

## 12. Conflicts between the three proposals — how each was resolved

| Topic | Safety-First | RLS-First | Ergonomics | **Canonical decision** |
|---|---|---|---|---|
| File count | 6 | **7** | 6 | **7** — isolate OWNED/MIRRORED `tenant_id` and the `created_by`-default drop for independent review/revert |
| `NOT NULL` method | **NOT-VALID CHECK → VALIDATE** | plain `SET NOT NULL` | plain `SET NOT NULL` | **NOT-VALID→VALIDATE→SET NOT NULL→drop CHECK** — strictly safer, scales to large tables; assertion guarantees it passes |
| Helper `search_path` | `public` | **`public, pg_temp`** | **`public, pg_temp`** | **`public, pg_temp`** — recommended `SECURITY DEFINER` hardening |
| `products` UNIQUE index | plain composite | plain composite | partial `WHERE … is not null` | **plain composite** — correct `ON CONFLICT` arbiter; partial adds nothing given NULL-distinct semantics |
| `organizations.shop_domain` | not null | not null | **nullable + UNIQUE** | **nullable + UNIQUE** — seed org may predate confirmed install domain |
| JWT-claim column default | hybrid | hybrid | hybrid | **hybrid (default + mandatory explicit in all service-role paths)** — unanimous |
| Post-backfill assertion | — | **explicit `RAISE`** | — | **adopt** — converts a botched backfill into a loud abort |
| Pre-rekey FK check | comment | **`pg_constraint` query** | comment | **adopt the query as a `0019` header precondition** |
| `connector_credentials` | OWNED, zero policies | OWNED, zero policies | OWNED, zero policies | **OWNED data, PLATFORM-style access (RLS-enabled, zero policies)** — unanimous |
| `slack_*` | PLATFORM, drop `"auth write"` | PLATFORM, drop `"auth write"` | PLATFORM, drop `"auth write"` | **PLATFORM, drop the 0004 `"auth write"` hole** — unanimous |
| Biggest risk | service-role bypasses RLS | service-role bypasses RLS | service-role bypasses RLS | **unanimous — neutralized via sequencing gate + DB tripwire + loud-failure schema (§0)** |
