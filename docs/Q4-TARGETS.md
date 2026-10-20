# Q4 Targets dashboard — data rules

`/targets`. One screen for the leadership team through Dec 31: where we are vs the Q4 goal
tiers, what is driving the gap, and whether the growth is profitable. Built Oct 2026.

## Sources

| Section | Source | How |
|---|---|---|
| DTC, marketplaces, B2B, seeding, BFCM | Shopify Admin GraphQL → `shopify_orders` / `shopify_order_lines` | `lib/targets/sync.ts`, cron `/api/cron/targets-sync` every 6h + the page's **Refresh** button. Incremental by `updated_at` per quarter window. |
| Q4 2025 baseline | Same puller, window `q4_2025` | Backfilled 2026-10-20: 12,029 orders, which matches Shopify Analytics' order count for the quarter. |
| Fulfillment SLA | Shopify fulfillments (written by ShipHero) | `first_fulfilled_at` on each order; no separate ShipHero pull. |
| Wholesale | `purchase_orders` (buyer POs: Revolve, Anthropologie, URBN, Nordstrom, Target…) | Counts toward Q4 only when invoiced; see below. |
| Profitability | SKU unit costs + `targets_weekly_inputs` (manual) | Weekly gross / contribution / net margin, MER; see below. |
| Launch tracker | `launch_drops` (manual) + order lines | Units, revenue, sell-through, days to sell out per drop. |
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

## Wholesale (stage 3)

- Rides on `purchase_orders` + `vendors` (partners). Migration 0024 adds `invoice_date`,
  `invoice_number`, `invoiced_amount`, `paid_date` and seeds the plan partners as vendors
  (Revolve, Anthropologie, Urban Outfitters, Nordstrom, Target) where missing.
- **Counted toward Q4**: `invoice_date` inside the quarter (status not draft/cancelled). Amount =
  `invoiced_amount` when set, else the PO total. **Paid in Q4**: `paid_date` inside the quarter.
- **Booked, not invoiced**: no invoice date, status not draft/cancelled, and the ship date
  (else cancel date, else order date) falls in the quarter. Shown separately, never counted.
- Edit from the tracker (row click) or add a PO; the inbound-email PO agent still lands POs
  in the same table, so forwarded POs show up here too.

## Profitability (stage 3)

- Weeks start Monday, store-local. Facts per week come from the synced orders (revenue
  buckets only): net sales, discount rate, units.
- **COGS** = Σ units × `products.unit_cost_usd` (RPC `targets_weekly_cogs`); the panel shows
  how many units had a cost. A per-week **COGS override** replaces the estimate. Unit costs are
  edited from the panel ("Unit costs").
- Manual weekly inputs (`targets_weekly_inputs`): Meta / TikTok / Google / other ad spend,
  3PL (RetroShip) cost, other opex, notes. No ad platform or QuickBooks feed exists for these.
- **3PL fallback.** When a week has no RetroShip invoice entered, its 3PL cost is the
  fulfillment estimate from the section above (ShipHero postage + rate card, or postage alone
  when no rate card is set). The row says "3PL est." so nobody mistakes it for an invoice.
- Gross margin = (net − COGS) / net. Contribution margin also subtracts ad spend and 3PL.
  Net margin also subtracts other opex. MER = net sales / ad spend. A margin is blank
  ("needs inputs") until the inputs it depends on exist; it is never guessed.
- Flags per week: discount rate above the setting (10%) or net margin below the guardrail
  (25%). The quarter roll-up uses only weeks with complete inputs and says "N of M weeks".
- The **net margin guardrail** reads the manual override first, then the computed quarter
  margin, then nothing (QuickBooks has no Q4 P&L).

## Fulfillment (fulfillment as a cost of goods)

- **Postage is actual.** `/api/cron/targets-sync` also mirrors ShipHero shipments
  (`shiphero_shipments`: label cost, carrier, service, weight, box) for the same Q4 windows and
  matches them to Shopify orders by order name (`#73074`); ShipHero "Manual Order" shipments
  (wholesale, gifting) are excluded. Only valid (non-voided) labels count; a shipment with no
  label cost (generic or hand label) counts as unmatched rather than as free postage.
- Weekly facts come from RPC `targets_fulfillment_weekly`: paid-bucket orders, units, shipping
  charged to customers, orders with a matched shipment, postage on them, and time to ship
  (Shopify first fulfillment − order created; average and median).
- **Match rate** = matched orders ÷ orders. Postage is extrapolated to unmatched orders at the
  matched per-order rate; below a 50% match the week shows "postage sample too thin" and no
  estimate (recent orders that have not shipped yet are the usual reason).
- **Rate card** (settings → `fulfillment`): RetroShip pick/pack per order (first unit included),
  per additional unit, packaging per order. Fulfillment cost = postage + pick/pack + packaging.
  Until the rate card is set the section is explicitly "postage only".
- Shown: fulfillment (or postage) per order, fulfillment % of net sales, shipping recovered
  (charged ÷ postage, plus the subsidy or surplus), median time to ship, weekly cost-per-order
  chart/table, carrier mix (RPC `targets_fulfillment_carriers`).
- Sync state key `shiphero_shipments:<window>` stores the last synced local day; each run
  re-pulls the last 3 days to catch late labels. ShipHero credits: ~1 per shipment.

## Launch tracker (stage 4)

- `launch_drops`: name, drop date, planned units, SKUs, notes. Manual.
- Per drop, from the drop date on and paid buckets only (RPC `targets_sku_daily`): units sold,
  revenue (discounted line totals scaled to quantity still on the order), sell-through =
  units / planned, days to sell out = first day the cumulative units reached the plan.
- SKUs not in the products list are still tracked if orders carry them; the form just warns.

## Operations

- Backfill or repair from a shell: `pnpm exec tsx scripts/targets-sync.ts --window q4_2025`
  (Shopify orders) or `--job shipments` (ShipHero). Needs the Shopify client credentials and
  the Supabase service key in the environment; the ShipHero token comes from
  `connector_credentials`.
- Sync state lives in `targets_sync_state` (watermark per window) and every run writes a
  `targets_sync_runs` row; the page shows the newest `synced_at` as "data as of".
- Resetting a window: delete its `targets_sync_state` row; the next run re-pulls the quarter.
