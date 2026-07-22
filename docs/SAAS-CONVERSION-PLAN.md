# Glow OS → Multi-Tenant ERP SaaS — Conversion Plan

**Decisions locked (2026-06-08):**
- **Isolation:** shared tables + `tenant_id` + RLS (single database).
- **Market:** mid-market / Paul's network (high-touch onboarding is fine), but delivered as a **Shopify-native embedded app** distributed via the Shopify App Store.
- **Shopify:** **public embedded app** — OAuth/token-exchange install flow, runs inside Shopify Admin (App Bridge). Paul owns standing this up. *(This supersedes the earlier custom-app-per-merchant v1 plan.)*
- **Billing:** **Shopify Billing API** (managed/recurring application charges). No Stripe.
- **Infra:** Supabase (Postgres + RLS) + Vercel, as today.

This plan is sequenced so each phase is shippable and the app keeps working for the existing single tenant throughout (your own shop becomes "tenant #1").

> **Biggest consequence of going Shopify-native: the auth model flips.** Tenant identity becomes the **shop** (`mystore.myshopify.com`), established on app install — not a Supabase email/password signup. Users are authenticated by the **Shopify session token** (a JWT App Bridge mints), which you verify server-side and map to an org. Supabase Auth is no longer the front door. See Phase 2 + Phase 4.

---

## Current-state summary (what we're converting from)

- Single-tenant, two-user shared-state. Every OWNED table uses RLS `using (true)` — any authenticated user reads/writes everything ([0001_phase0_init.sql](../supabase/migrations/0001_phase0_init.sql:290)).
- Credentials are **global**: `connector_credentials` is one row per `(connector, key)` ([0003](../supabase/migrations/0003_connector_credentials.sql)); Shopify also reads `process.env.SHOPIFY_*` ([access-token.ts](../lib/shopify/access-token.ts)).
- MIRRORED cache tables (`shopify_metrics`, `qb_financials`, `klaviyo_metrics`, `hubspot_deals`) are keyed by `as_of_date` / global id — **no tenant dimension**, so two tenants would collide on the same row.
- Cron pullers use the service-role client and pull *the* store, every N hours ([vercel.ts](../vercel.ts)).
- Shopify uses the `client_credentials` grant against one env-configured store.

The **domain layer** (PO board, manufacturing runs, costing, inventory intelligence, AI digests) ports cleanly and is the real product moat. The **data/auth/integration layers** are what need rework.

---

## Phase 1 — Tenant foundation (schema + RLS)

Goal: introduce the tenant dimension and make isolation enforceable. App still serves one tenant.

1. **New tables**
   - `organizations` (id, name, slug, created_at, plan, status).
   - `memberships` (org_id, user_id, role enum `owner|admin|member`, created_at; PK `(org_id, user_id)`).
   - Helper: `public.current_org_ids()` → set of org_ids the JWT user belongs to (SECURITY DEFINER, reads `memberships`). Used by every policy.
2. **Add `tenant_id uuid not null references organizations(id)` to every OWNED table**: vendors, purchase_orders, po_line_items, po_payments, manufacturing_runs, campaigns, campaign_tasks, campaign_links, products, and the PO/costing/inventory tables added in migrations 0005–0014.
   - Child tables (po_line_items, etc.) can either carry `tenant_id` directly (simpler RLS, recommended) or inherit via parent — prefer **denormalized `tenant_id` on every table** so policies never need a join.
3. **Re-key MIRRORED tables** to include tenant:
   - `shopify_metrics` PK → `(tenant_id, as_of_date)`; same for `qb_financials`, `klaviyo_metrics`. `hubspot_deals` → add `tenant_id`, PK `(tenant_id, id)`.
4. **Rewrite all RLS policies**: replace `using (true)` with `using (tenant_id in (select current_org_ids()))` and matching `with check`. MIRRORED tables: authenticated read scoped to tenant; writes still service-role only.
5. **Backfill migration**: create your org, stamp all existing rows with its `tenant_id`, then add the `not null` constraint.

> This is the largest mechanical chunk. Do it as one migration series (`0015_*`) and test RLS with two seeded orgs before touching app code.

---

## Phase 2 — Auth model flip: Shopify session → org (the big one)

Goal: every request is authenticated by a verified Shopify session and mapped to its org. **This replaces Supabase Auth as the front door.**

1. **Tenant = shop.** `organizations` is keyed by `shop_domain` (`*.myshopify.com`), created on app install (Phase 4). No email/password signup.
2. **Session-token verification.** Embedded app pages load inside Shopify Admin; App Bridge mints a short-lived **session token (JWT)** on every request. A server helper verifies it (signature against your app's client secret, `dest`/`aud` claims) and resolves `shop → org`. This is the new `requireOrg()` — returns `{ shop, orgId, role }`, throws on invalid token.
3. **RLS needs the org from the Shopify session, not `auth.users`.** Two options:
   - **(a) Mint a Supabase JWT** with an `org_id` (and `role`) claim after verifying the Shopify session, so RLS policies read `org_id` straight from the JWT. Cleanest — keep using Supabase client + RLS as the enforcement layer.
   - **(b) Server-only data access** with the service-role client, where `requireOrg()` supplies `orgId` and every query filters explicitly. RLS becomes a backstop, not the primary gate. Simpler to wire, but loses RLS-by-default safety.
   - **Recommended: (a)** — preserves the RLS guarantees Phase 1 builds.
4. **Writes set `tenant_id = orgId`** on every insert path. Audit `lib/actions/*` and the parse routes.
5. **Embedded-app plumbing**: App Bridge, CSP `frame-ancestors` for the Shopify Admin domains, `SameSite=None; Secure` cookies (or token-based, no cookies), and session-token fetch wrappers for all client→server calls.
6. **Multi-shop staff**: a Shopify staff user who installs the app on several shops maps to several orgs — keep an org switcher, but it's keyed by shop, not by manual membership.

> Existing internal users / Slack: decide whether your own team still has a non-Shopify login path (admin/superuser) or whether everything funnels through a shop. See open questions.

---

## Phase 3 — Per-tenant connector credentials (encrypted)

Goal: each org connects its own Shopify / QB / Klaviyo / HubSpot.

1. **Re-shape `connector_credentials`** → PK `(tenant_id, connector, key)`. Keep RLS no-policy (service-role only); the UI continues to get a "saved" boolean via server action.
2. **Encrypt at rest**: move off plaintext. Options: Supabase Vault / pgsodium, or app-layer envelope encryption with a KMS-held key. Your own migration note ([0003](../supabase/migrations/0003_connector_credentials.sql)) already flags this as the trigger point.
3. **Connector resolution by tenant**: `resolveShopifyAccessToken` and the QB/Klaviyo/HubSpot clients take `orgId` and read that org's credentials instead of `process.env`. Env vars become *fallback for tenant #1 only* (or dropped).
4. **OAuth connectors per tenant** (QuickBooks, HubSpot): the existing OAuth callback routes ([app/api/oauth/quickbooks](../app/api/oauth/quickbooks)) must persist tokens **per org** and refresh per org.

---

## Phase 4 — Shopify-native public embedded app

Goal: a real App-Store-distributable app. Install creates the org; uninstall tears it down.

1. **App registration** in the Partner/Dev Dashboard: embedded app, Admin API scopes (orders, products, inventory, customers, etc.), App URL + allowed redirect URLs pointing at Vercel.
2. **Install / token exchange.** Use Shopify **managed installation + token exchange**: App Bridge session token → exchange server-side for an **offline access token** (long-lived, for cron pullers) and online tokens as needed. Persist the offline token **per org**, encrypted (Phase 3). On install, upsert the `organizations` row for the shop.
3. **Mandatory webhooks** (required for App Store): `app/uninstalled` (mark org inactive, stop pullers, schedule data deletion) and the three **GDPR/compliance webhooks** (`customers/data_request`, `customers/redact`, `shop/redact`). Verify HMAC on all.
4. **Data webhooks instead of polling** where it matters: `orders/create`, `inventory_levels/update`, etc. → reduces reliance on the every-2-hours cron and scales better. Cron becomes a reconciliation backstop (Phase 5).
5. **`resolveShopifyAccessToken(orgId)`** reads the stored offline token; the `client_credentials` env path is dropped (or kept only for your own tenant #1 during transition).
6. **App review** prerequisites: privacy policy, the GDPR webhooks above, performance/Lighthouse checks for the embedded UI, and a test store walkthrough.

---

## Phase 5 — Cron fan-out per tenant

Goal: pullers run for every active tenant without collisions.

1. Each cron route loops over active orgs (those with the relevant connector configured) and calls the puller with `orgId`. Pullers write tenant-scoped rows (Phase 1 re-keying makes this safe).
2. Watch the Vercel function time budget (`maxDuration = 60`). With more than a handful of tenants, move to: (a) a queue (one job per tenant) or (b) per-merchant Shopify webhooks for orders/inventory instead of polling.
3. Slack triggers/digests become per-org (per-workspace) — the Slack identity tables already exist; scope them by tenant.

---

## Phase 6 — Shopify billing + table stakes

- **Billing via the Shopify Billing API** (managed pricing or `appSubscriptionCreate` recurring charges). The merchant approves the charge inside Shopify checkout; Shopify collects and pays out. Store plan/status on the org, kept in sync via the `app_subscriptions/update` webhook. Gate features by plan in `requireOrg()`. No Stripe, no PCI surface.
- **Free trials / usage**: Shopify supports trial days and usage-based line items if you want metered pricing later.
- **Roles/permissions**: map Shopify staff permissions or keep a simple owner/admin/member on `memberships`; enforce in the guard.
- **Secrets hardening**, audit logging, and the GDPR data-request/redact handlers (wired in Phase 4) backed by a real per-org export/delete routine.

---

## Sequencing & effort

| Phase | Scope | Rough effort |
|---|---|---|
| 1 | Schema + `tenant_id` + RLS + backfill | Largest; 1–2 wks |
| 2 | Auth flip: Shopify session → org + RLS JWT | 1–2 wks (riskiest) |
| 3 | Encrypted per-tenant credentials | ~1 wk |
| 4 | Shopify embedded app: install, token exchange, webhooks | 1–2 wks + review lead time |
| 5 | Cron fan-out / webhook ingestion | 3–5 days |
| 6 | Shopify billing + GDPR + roles | ~1 wk + review |

Two critical paths now: **Phase 1** (tenant model + RLS, tested with two seeded orgs) and **Phase 2** (the auth flip — the single biggest architectural change, since it replaces how every request is authenticated). Phase 4 has external **App Store review lead time**, so register the app and start the install flow early even while Phases 1–2 are in progress.

## Resolved architecture decisions (2026-06-08 — "build it to scale")

1. **RLS auth bridge → mint a Supabase JWT with an `org_id` claim.** After verifying the Shopify session token, the server issues a short-lived Supabase JWT carrying `org_id` (+ `role`). Every RLS policy reads `org_id` from the JWT, so isolation is enforced *in the database* by default — the safest pattern at scale. The service-role client is reserved for cron pullers and webhook ingestion only.

2. **Two distinct auth surfaces — merchants vs. your team.**
   - **Merchant app** = embedded, Shopify-session-only. No Supabase email/password for merchants.
   - **Internal back-office** = a separate, non-embedded surface (own route group, e.g. `/admin`) authenticated by **Supabase Auth**, restricted to Glow staff via a `platform_admins` table / superuser role. This is where the Slack integration, cross-tenant support, and ops tooling live. It can read across tenants via dedicated policies keyed on `is_platform_admin()`.
   - Rationale: never bolt internal/superuser access onto the merchant auth path — keeping them separate is what scales cleanly and avoids privilege-escalation footguns.

3. **Webhook-first ingestion, cron as reconciliation backstop.** Phase 4 subscribes to `orders/create`, `inventory_levels/update`, etc. and writes tenant-scoped rows on receipt. The cron jobs become a periodic *reconciliation* sweep (catch missed/failed webhooks, recompute daily rollups) rather than the primary data path. This is the only option that scales past a handful of tenants without blowing the Vercel function budget.

4. **Encryption → Supabase Vault** for offline Shopify tokens + connector credentials. Native to the stack, no extra KMS infra, keys never leave Postgres. App-layer envelope encryption only if a future compliance requirement demands an external KMS.
