# Making the Targets dashboard a product

Notes from building `/targets` for Greedy, written for the day this becomes a tool other
Shopify brands pay for. `docs/SAAS-CONVERSION-PLAN.md` covers the platform (tenants, auth,
billing); this is about the Targets module specifically: what is already portable, what is
hard-wired to Greedy, and what the product is.

## What the product is

One screen a founder opens every morning that answers three questions with their own data:

1. **Where are we vs. the number?** Tiered goals, pace (linear and last year's curve), a
   baseline pulled from their store rather than typed in.
2. **What is driving the gap?** Revenue split by channel with the same exclusion rules the
   finance team uses (paid only, no seeding, wholesale counted when invoiced).
3. **Is the growth profitable?** Gross → contribution → net margin by week, with every cost
   either real (COGS from unit costs, postage from the 3PL) or explicitly entered, never guessed.

The wedge is #3 with **fulfillment as a cost of goods**. Shopify tells a brand what it charged
for shipping; almost nothing tells it what shipping actually cost per order, by carrier, by week,
against what it charged. Brands at $1–10M on a 3PL feel this every BFCM and track it in a
spreadsheet. That section alone is a reason to connect.

What it is not: another analytics suite. No funnels, no attribution, no cohort explorer. One
page, a settings sheet, a refresh button, and a few manual inputs for what no API has.

## Already tenant-agnostic

- **Pure logic** has no Greedy in it and is unit-tested: `lib/targets/classify.ts`
  (bucketing rules as data), `pace.ts`, `profit.ts`, `fulfillment.ts`, `dates.ts`,
  `shipments-sync.ts`, `sync.ts`. Rules, tiers, dates, rate card are all **data**
  (`targets_settings` jsonb), not code.
- **Connectors behind interfaces.** `syncShopifyOrders({ shopify, db })` and
  `syncShipHeroShipments({ shiphero, db })` take `ShopifyLike` / `ShipHeroLike` / `DbLike`.
  Per-tenant credentials slot in without touching the sync.
- **Read models use RPCs with `security invoker`**, so adding `tenant_id` to the tables and an
  RLS policy scopes every number without rewriting queries.
- **Store timezone** is a parameter (`STORE_TZ` default), not a constant in the math.

## Hard-wired to Greedy today (and the fix)

| Today | For a second tenant |
|---|---|
| `targets_settings.key = "q4_2026"`, one row | Key by `(tenant_id, period)`; "period" generalizes Q4 to any goal window (a month, a launch, a year). |
| `DEFAULT_RULES` channel names (Greedy Marketplace Sync → Ulta, Corso, ShopMy…) | Rules live in settings and are seeded from the tenant's actual `channel_name` / tag distribution on first sync, with a "classify this channel" UI for the long tail. |
| `shopify_orders`, `shopify_order_lines`, `shiphero_shipments`, `targets_*` tables have no tenant column | Add `tenant_id` + RLS per the Phase 1 plan; `id` stays the Shopify/ShipHero gid (globally unique). |
| Shopify client-credentials token from env; ShipHero refresh token in a global `connector_credentials` row | Per-tenant encrypted credentials (Phase 3). The 3PL is pluggable: ShipHero today, ShipStation/ShipBob/Flexport later — each maps to the same `ShipmentRow` (postage, carrier, method, weight, order name). |
| Matching shipments to orders by order **name** | Works for every 3PL that stores the Shopify order name; fall back to tracking-number ↔ fulfillment join when a 3PL does not. |
| Wholesale tracker rides on Greedy's `purchase_orders` schema | Keep a minimal `wholesale_invoices` table for tenants without the ERP side. |
| Cron pulls one store every 6h | A queue (one job per tenant per window) with the same budgeted, resumable sync; the watermark design already assumes interruption. |
| B2B / seeding / 100%-discount heuristics | Configurable tags and a per-tenant toggle, same shape as `count_b2b_in_total`. |

## Lightweight by design

- **No warehouse.** Orders mirror into Postgres at a few hundred bytes a row; a $10M brand is
  ~100K orders a year. Supabase handles it; aggregates are SQL views/RPCs.
- **Degrades honestly.** Every tile has a "needs X" state. A tenant with Shopify only still gets
  pace, channels, shipping charged and discount flags; adding the 3PL unlocks postage; adding
  unit costs unlocks margin. Onboarding is additive and each step shows value.
- **Install cost.** Shopify OAuth (read orders, products, fulfillments), optional 3PL token,
  optional unit-cost CSV. Ten minutes.

## Pricing thought

Flat per store, by order volume band. The fulfillment section is the upgrade trigger: "see what
shipping really costs you" is the sentence on the pricing page. Shopify Billing API, as decided.

## Sequence, if we go

1. Finish tenancy Phase 1 (schema + RLS) with Greedy as tenant #1 — the plan already exists.
2. Rules and settings become per-tenant data with a seeding step from the tenant's own data.
3. Pluggable 3PL adapters behind `ShipHeroLike` → `ShipmentSourceLike`.
4. Embedded Shopify app shell (Phase 2/4) and billing.

Nothing in 1–3 changes how `/targets` looks or what it computes; Greedy keeps using it the
whole way.
