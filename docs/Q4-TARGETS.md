# Q4 Targets dashboard — data rules

`/targets`. One screen for the leadership team through Dec 31: where we are vs the Q4 goal
tiers, what is driving the gap, and whether the growth is profitable. Built Oct 2026.

## Sources

| Section | Source | How |
|---|---|---|
| DTC, marketplaces, B2B, seeding, BFCM | Shopify Admin GraphQL → `shopify_orders` / `shopify_order_lines` | `lib/targets/sync.ts`, cron `/api/cron/targets-sync` every 6h + the page's **Refresh** button. Incremental by `updated_at` per quarter window. |
| Q4 2025 baseline | Same puller, window `q4_2025` | Backfilled 2026-10-20: 12,029 orders, which matches Shopify Analytics' order count for the quarter. |
| Fulfillment SLA | Shopify fulfillments (written by ShipHero) | `first_fulfilled_at` on each order; no separate ShipHero pull. |
| Wholesale | `purchase_orders` (buyer POs: Revolve, Anthropologie, URBN, Nordstrom, Target…) | Counts toward Q4 only when invoiced. |
| Net margin, cash | QuickBooks `qb_financials` (frozen at 2026-06-22) with manual overrides | Guardrail badges show the source and the as-of date. |
| Targets, guardrails, dates, staffing tiers | `targets_settings` (key `q4_2026`) | Edited from the page's Settings sheet. |

All days are store-local (`America/Phoenix`, no DST), like Shopify Analytics. The older
`shopify_metrics` table buckets by UTC day and stores subtotals, which is why the targets page
does not reuse it.

## What counts as revenue

Every order in a tracked window is classified once at sync time (`lib/targets/classify.ts`,
unit-tested). Rules, in order:

1. Test orders → excluded.
2. Cancelled → excluded.
3. Financial status not `PAID` / `PARTIALLY_REFUNDED` / `REFUNDED` → **unpaid**, excluded
   (pending, authorized, voided, expired).
4. Tag `seeding`, `Gifting` or `PR`, **or** a 100% discount → **seeding** (marketing line:
   units + retail value, never revenue).
5. Tag `B2B` or `Wholesale` → **B2B (Shopify)**, its own section. Counted in the Q4 total by
   default; toggle in Settings.
6. Channel Draft Orders, ShopMy, LTK, Shopify Mobile, Shopify Claude Connector App, Corso →
   **excluded channel** (shown with order count and net so nothing hides).
7. Marketplaces by sales channel: `Greedy Marketplace Sync` → Ulta Marketplace; `TikTok`;
   `Shop`; `Facebook & Instagram` / `Meta AI and Muse` → Meta.
8. Online Store, the headless storefront, Buy Button, Google & YouTube → **DTC**.
9. Anything else → **DTC (other storefronts)**, listed by raw channel name so it can be promoted
   or excluded.

Notes:
- The `ShopMy` **tag** on an Online Store order is an affiliate attribution on a paid sale and
  stays DTC. The `ShopMy` **channel** is 100%-discounted gifting and is excluded.
- Shipping-protection lines (`CORSOSP`) stay in net sales (Shopify counts them too) but are
  excluded from unit counts.
- Net sales = gross merchandise − discounts − returns, before shipping and tax. Returns are
  attributed to the order's day, Shopify Analytics attributes them to the refund day, so the
  two can differ by a few hundred dollars on heavy-return days.

## Pace

- **Linear**: revenue to date ÷ days elapsed × 92.
- **BFCM-weighted**: revenue to date ÷ the share of last year's Q4 revenue that had landed by
  the same day of the quarter (last year's curve with the same rules). This is the headline.
- Tiers (Plan $1.1M, Stretch $1.2M, Crush $1.5M) show reached %, gap, required $/day and
  whether the projection clears them.
- "Same weekday last year" for BFCM days = the date 364 days earlier (52 weeks), so Black Friday
  2026 (Nov 27) compares to Black Friday 2025 (Nov 28).

## Operations

- Backfill or repair from a shell: `pnpm exec tsx scripts/targets-sync.ts --window q4_2025`.
  Needs the Shopify client credentials and the Supabase service key in the environment.
- Sync state lives in `targets_sync_state` (watermark per window) and every run writes a
  `targets_sync_runs` row; the page shows the newest `synced_at` as "data as of".
- Resetting a window: delete its `targets_sync_state` row; the next run re-pulls the quarter.
