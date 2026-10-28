# Greedy OS → the must-have Shopify brand co-pilot

**Status:** proposed roadmap, 2026-10-28. Written from a full read of `main` at `754293c`
(60 commits, every module, every migration, every cron) plus a clean run of
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` (all green, 46 tests).

The four reasons Greedy OS exists, in Paul's words:

1. **Purchase orders:** track POs and dates, send me notifications.
2. **Scale:** growth, inventory management, projections, hitting goals.
3. **Profitability:** track profit after cost.
4. **Finance in:** upload P&Ls or connect QuickBooks.

This document answers three questions: what is actually built, where it falls short of
those four, and the shortest path to a tool a Shopify brand opens every morning because it
would be reckless not to.

---

## 1. The verdict

Greedy OS is further along than most internal tools ever get. The domain layer is real
(wholesale POs, factory runs, landed cost, a deterministic reorder forecast, a Q4 targets
page with honest margin math, an email agent that reads factory threads and updates
records). The design system is coherent and restrained. The codebase is healthy.

What it is **not yet** is a co-pilot. Today it is a set of well-built rooms with no hallway:

- **Nobody is told anything.** Every outbound notification is switched off
  (`lib/slack/dispatch.ts`), the morning digest was disabled because it posted whether or not
  anything changed, and there is no in-app inbox, no email, no push. The PO radar still
  runs daily and updates records from factory emails, but its findings are only visible
  if you open the right sheet.
- **"What POs are coming" lives in four places** (Manufacturing, the ShipHero inbound mirror
  that no screen renders, Timeline, Inventory "incoming") and none of them shows the whole
  journey: factory → in transit → 3PL receiving → on the shelf.
- **There are two truths for revenue.** The Dashboard reads `shopify_metrics` (UTC days,
  subtotals, no exclusions); Targets reads `shopify_orders` (store days, net sales, paid
  only, seeding excluded). They disagree, so the Dashboard cannot be trusted next to Targets.
- **Profitability is good but trapped inside "Q4 2026".** The margin engine, the fulfillment
  as cost of goods work, the unit costs: all keyed to one hard-coded quarter that ends in
  nine weeks. Manufacturing runs compute landed cost per unit and never feed it to the
  product cost the margin math uses.
- **Finance in is broken.** QuickBooks has been frozen since 2026-06-22. The in-app OAuth
  puller is unscheduled, the replacement routine only runs when a Claude app is open, and
  there is no way to upload a P&L at all.
- **Fluidity is good at the component level and poor at the app level.** Every navigation
  re-runs the layout's sync-status and nav-counter queries (which build the entire timeline
  just to count overdue items), every page is `force-dynamic`, there are no cached segments,
  no optimistic updates (21 `router.refresh()` calls), no per-entity URLs, and no
  `error.tsx` anywhere.

The good news: almost every missing piece is a **join, a surface, or a switch**, not a
rewrite. The data is already synced. The plan below is sequenced so the first two phases
deliver the thing Paul built this for (POs, dates, notifications) within weeks, and every
later phase reuses what the earlier ones lay down.

---

## 2. What is built today

### Stack and health

| Item | State |
|---|---|
| Framework | Next.js 16.2 (app router, view transitions on, Turbopack), React 19.2, Tailwind v4, shadcn (base-nova), Recharts, dnd-kit, AI SDK 6 via Vercel AI Gateway |
| Data | Supabase Postgres + Auth, 26 migrations (`0001`–`0026`), hand-maintained `types/db.ts`, RLS shared-state (`using (true)`) for 3 users |
| Hosting | Vercel, `main` only deploys, 6 scheduled crons |
| Quality gates | typecheck clean, lint clean (1 warning), 46 unit tests (targets math only), production build passes |
| Size | ~3k lines routes, ~18k components, ~19k lib |
| Tenancy | single tenant; migrations `0015`–`0018` authored but not applied; SaaS plan in `docs/SAAS-CONVERSION-PLAN.md` |

### Module map

| Module | Route | What it does | State |
|---|---|---|---|
| Dashboard | `/dashboard` | KPI tiles, channel mix, attention card, 3 views, hideable cards | Works; reads the old `shopify_metrics`, stale QB, stubbed Klaviyo |
| Q4 Targets | `/targets` | Pace vs tiers, DTC/marketplace/B2B/wholesale sections, BFCM, fulfillment as COGS, weekly profitability, launch tracker | Strongest module; hard-wired to `targets_settings.key = 'q4_2026'` |
| Purchase Orders | `/purchase-orders` | Wholesale **buyer** POs (Revolve, Anthro, Nordstrom): board, list, PDF/image upload → LLM parse → review, detail sheet with payments, labels, shipment, invoice fields, delete, correspondence | Mature |
| Manufacturing | `/manufacturing` | Factory runs (supplier POs): board, table, proforma upload → parse, run form, air/sea landed margin, correspondence | Mature; no payment ledger, no link to 3PL receiving |
| Inventory | `/inventory` | Deterministic growth-aware reorder forecast per SKU (run rate × seasonality × YoY, lead time from runs, reorder qty) | Good engine; DTC demand only, no wholesale draw-down, no chart, no `loading.tsx` |
| Timeline | `/timeline` | Horizon, month, agenda views over runs, POs, cancel dates, payments, campaigns, tasks, deals | Works |
| Campaigns | `/campaigns` | Campaign CRUD, task board, templates | Works |
| Vendors / Products | `/vendors`, `/products` | CRUD; Shopify product sync; `products.unit_cost_usd` | Vendors table mixes buyers and factories |
| Settings | `/settings` | Connector credentials (DB first, env fallback), QB OAuth card, Slack identities | Works; credentials plaintext |
| Analyst | ⌘J drawer, Slack bot | Claude Sonnet 4.6 with read + write tools over owned data | No tools for targets, ShipHero, fulfillment, QB |
| Search | ⌘K | Pages, actions, live record search, `?open=` deep links | Works |
| Inbound email agent | Postmark → `/api/inbound/*` | Threads, links, extracts, auto-applies safe updates, daily radar | Works; outputs suppressed with Slack |

### Data pipes (actual status, not README status)

| Source | Table(s) | Cadence | Status |
|---|---|---|---|
| Shopify orders (targets) | `shopify_orders`, `shopify_order_lines` | 6h + manual | Healthy, but only Q4 2025 and Q4 2026 windows |
| Shopify daily metrics | `shopify_metrics` | 2h | Healthy, legacy model (UTC day, subtotal, unclassified) |
| Shopify inventory, products | `shopify_inventory`, `products` | 2h / manual | Healthy |
| Shopify SKU sales history | `sku_sales_history` | weekly | Was failing every Monday until 2026-10-20 (table did not exist); now healthy |
| ShipHero on-hand, inbound POs, wholesale orders | `retroship_inventory`, `shiphero_inbound_pos`, `shiphero_wholesale_orders` | 6h | Healthy; inbound POs and the reconcile module (`lib/shiphero/reconcile.ts`) have **no UI consumer** |
| ShipHero shipments (postage) | `shiphero_shipments` | 6h | Healthy, Q4 windows only |
| QuickBooks | `qb_financials`, `qb_revenue_by_channel` | daily routine | **Frozen since 2026-06-22** |
| HubSpot | `hubspot_deals` | 6h | Real puller, low value to the four pillars |
| Klaviyo | `klaviyo_metrics` | off | Stub, mock rows deleted |
| Slack out | `slack_notifications` | off | Global kill switch since 2026-10-20 |

### What is genuinely strong (keep, build on)

- The **targets math** (`lib/targets/*`): classification rules as data, pace curves, margin
  that stays blank until inputs exist, fulfillment postage matched per order. Unit tested.
- The **forecast engine** (`lib/inventory/forecast.ts`): deterministic, auditable, narrated
  by a model that is forbidden to touch numbers. This is the right architecture.
- The **inbound email agent** (`lib/inbound/*`): tool-using, forward-only guardrails,
  idempotent daily re-run. Few brands have this.
- **Document parsing** (PO and proforma PDFs → structured review dialog).
- **Design discipline**: `STYLE.md`, tokens, tabular numerals, skeleton routes, light and
  dark, sheets over modals, ⌘K and ⌘J.
- **Core/action split** (`lib/*/core.ts` used by both server actions and AI tools) so the
  analyst and the UI share one write path.

---

## 3. Gap analysis against the four pillars

### 3.1 Purchase orders, dates, notifications

What exists: wholesale POs with payments, cancel dates, labels, shipment, invoice fields;
factory runs with expected/actual completion and arrival dates; ShipHero inbound POs with
received quantities and close dates; a daily radar that scores every open order
red/amber/green from the email thread.

What is missing:

| Gap | Evidence | Consequence |
|---|---|---|
| No notification delivery at all | `SLACK_NOTIFICATIONS_ENABLED = false`; digest and health crons commented out in `vercel.ts`; no `notifications` table, no email, no push | The agent finds "ETA passed, no reply in 6 days" and nobody hears |
| Digest was noise | HANDOFF: "posted every day whether or not anything had changed" | The fix is a change-detecting digest, not no digest |
| Factory runs have no payment schedule | `po_payments` only references `purchase_orders`; deposits and balances for runs live in notes | No "cash out next 30 days", no deposit-due alerts for the orders that actually cost money |
| No date history | Dates are overwritten in place | Cannot show "ETA slipped Aug 7 → Aug 21 (factory email, Jul 30)" or measure vendor reliability |
| Inbound journey split across screens | Runs on `/manufacturing`; 3PL receiving in `shiphero_inbound_pos` with zero UI; "incoming" units only inside the forecast | "Where is my 12,300 brushes?" takes three screens and a guess |
| Reconciliation results unused | `loadInboundDiscrepancies`, `loadWholesaleReconciliation` are never imported by a page | Short receipts and wholesale orders the 3PL shipped but nobody booked stay invisible |
| Vendors are one bucket | `vendors` holds Revolve and Beone alike; no `kind` | Labels say "Vendor" on a buyer PO; filters cannot separate factories from retailers |
| No per-entity URL | Sheets opened via `?open=<id>` then `router.replace` | Notification links are fragile; back button does not close the sheet; nothing is bookmarkable |

### 3.2 Scale: growth, inventory, projections, goals

| Gap | Evidence | Consequence |
|---|---|---|
| Goals hard-wired to one quarter | `TARGETS_SETTINGS_KEY = 'q4_2026'`, sync windows `q4_2025` and `q4_2026`, nav label "Q4 Targets" | The best page in the app goes stale on Jan 1 |
| Two revenue models | Dashboard on `shopify_metrics`; Targets on `shopify_orders` | Numbers disagree; the Dashboard overstates (includes seeding, 100%-discount, unpaid) |
| Forecast ignores wholesale demand | `lib/inventory/load.ts` reads `sku_sales_history` (Shopify only); open `po_line_items` are not subtracted from supply | A 5,000-unit Revolve PO can wipe out stock the forecast calls "comfortable" |
| No per-product planning inputs | Lead time derived from run history or a 105-day default; no safety stock, MOQ, case pack | Reorder qty is a demand number, not an orderable number |
| No projection view | Table only | Cannot see the stock curve, cannot try "what if this run lands two weeks late" |
| Forecast → action is manual | No "draft a run from this reorder" | The recommendation stops at a number |
| Sell-through for wholesale is a plan only | `docs/SELL-THROUGH-PLAN.md`, open questions since July | Sell-in is tracked, sell-through is not; Revolve reorders are reactive |
| Growth view is thin | Dashboard tiles are trailing 30 days with a 7-day delta | No monthly/YoY trend by channel, no new vs returning trend, no top-SKU movement outside Q4 |

### 3.3 Profitability after cost

| Gap | Evidence | Consequence |
|---|---|---|
| Margin only inside Q4 Targets | `lib/targets/profitability.ts` keyed to the Q4 window | No rolling monthly margin, no last-12-months view |
| Unit cost is a single hand-typed number | `products.unit_cost_usd` written only from the Targets "Unit costs" dialog | Manufacturing runs compute `air/sea_landed_per_unit_usd` and never feed it; costs drift from reality |
| No cost history | One column | Margin for March uses today's cost |
| Ad spend is manual weekly entry | `targets_weekly_inputs.ad_spend_*` | Contribution margin is only as current as the last data-entry session |
| No payment-processing or return cost | Not modelled | Contribution margin is optimistic by 3–4 points |
| Wholesale margin not computed | PO lines carry wholesale `unit_cost` (the price to the retailer) but nothing joins to product cost | Cannot answer "is the Anthro program profitable after labels and freight" |
| No order- or SKU-level unit economics | Weekly roll-up only | Cannot rank SKUs or channels by contribution |

### 3.4 P&L upload / QuickBooks

| Gap | Evidence | Consequence |
|---|---|---|
| QuickBooks frozen | `qb_financials` last row 2026-06-22; in-app puller unscheduled (production keys gauntlet); replacement routine needs a Claude app open | Cash, AR, AP, and book P&L on the Dashboard are four months old |
| No P&L upload | `DOCUMENT_ACCEPT` is images and PDF for PO/PI only; no CSV/XLSX path anywhere | The explicitly requested fallback does not exist |
| QB schema is thin | One row per day: cash, AR buckets, AP, revenue, COGS, expenses, NI | Even when QB worked there was no monthly P&L by account, no classes beyond DTC/wholesale |
| No reconciliation of book vs Shopify-derived | Two unrelated numbers | Cannot explain why QB revenue ≠ Shopify net sales (timing, wholesale invoicing, returns) |

---

## 4. UI and fluidity audit

### What already feels premium

Density and restraint (Linear/Vercel/Attio reference bar is visibly honoured), warm zinc +
brand peach tokens, `tabular-nums` everywhere, pulse dots for freshness, animated numbers,
sparklines, route-level skeletons on most pages, cross-fade view transitions, ⌘K with real
record search, ⌘J analyst drawer, collapsible mobile nav, semantic status pills per PO
stage, empty states with actions, dark mode as a first-class theme.

### What holds it back (specific)

**Latency on every navigation.** `app/(app)/layout.tsx` awaits `getGlobalSyncStatus`
(4 queries) and `getNavCounters` (payments, runs, campaign tasks, **and
`fetchTimelineEvents`**, which loads every run, PO, line, payment, campaign, task and deal
to count overdue events) before rendering any page. All 26 route files are
`force-dynamic`; no `use cache`, no `cacheComponents`, no Suspense boundaries around slow
sections except at route level. The targets page serially builds a large read model on
each visit. Result: the shell is never instant.

**Mutations feel heavy.** 21 `router.refresh()` calls after server actions, zero
`useOptimistic`. Marking a payment paid, advancing a stage, or saving a week's inputs
round-trips the whole page.

**Inconsistent chrome.** `PageHeader` (text-xl, sticky) is used by POs, Manufacturing,
Campaigns, Targets, Settings; Dashboard, Inventory and Timeline roll their own text-2xl
headers. `/inventory` has no `loading.tsx`. `formatDate` is copied three times
(`po-list-table`, `po-detail-sheet`, `forecast-table`), each slightly different.

**Navigation is a flat list of ten.** No grouping by job (operate / grow / finance /
setup), and a nav item named after a calendar quarter.

**No URLs for things.** Every record opens in a sheet via `?open=` and the query is
immediately stripped. A notification, a Slack message, or a teammate cannot link to "PO
GUTR21". Browser back does not close the sheet.

**No error boundaries.** No `error.tsx`, `not-found.tsx` or `global-error.tsx`; a failed
query renders an inline red box in some pages and a crash in others.

**Attention is scattered.** The Dashboard "Attention" card, the `NeedsAttention` banner on
two pages, sidebar counters, the timeline "N overdue" button and the suppressed Slack radar
are five partial inboxes with no shared source.

**Mobile is survivable, not designed.** Wide tables scroll horizontally; boards need a
desktop; the one screen a phone user needs (what needs me today) does not exist.

**The analyst is generic.** It opens with the same four prompts on every page. It cannot
see the targets page, the 3PL mirror, or fulfillment costs, and there is no "ask about this
PO" entry point on a sheet.

---

## 5. What "must-have co-pilot" means here

### The morning loop

The product is one habit: open it with coffee, know in 60 seconds what needs you, act on
it in two clicks, trust every number. Five questions it must answer, in order:

1. **What needs me today?** (payments due, cancel dates, slipped ETAs, stalled factory
   threads, reorder windows, sync failures)
2. **What is coming in, and when?** (every inbound run from factory to shelf, with
   receiving progress)
3. **Where am I against the number?** (goal pace for the active period, by channel)
4. **Am I making money after cost?** (contribution margin this month, by channel and SKU)
5. **What should I do about it?** (draft the reorder, mark it paid, snooze it, ask why)

### Design principles for fluid

- **Instant shell, streamed data.** The frame, nav and headers render from cache in under
  100 ms; each data section streams behind its own skeleton.
- **Optimistic by default.** Status, paid, done, snooze flip immediately with undo toasts;
  the server confirms.
- **Everything has a URL.** `/orders/inbound/[id]`, `/orders/wholesale/[id]`,
  `/goals/[id]`, `/inventory/[sku]`. Sheets stay as the presentation (intercepting routes),
  URLs become real.
- **One inbox.** Every alert, from any source, is a row in one table and renders in one
  place, with the same actions, on web, email and phone.
- **Every number is traceable.** Hover or click any figure to see the source table, the
  as-of time and the rule that produced it (Targets already does this in prose; make it a
  component).
- **Degrade honestly.** Blank with "needs X" beats a guess. Already the house rule; keep it.
- **No emoji, no bounce, numbers are tabular.** `STYLE.md` stands.

### Information architecture

| Today | Proposed | Notes |
|---|---|---|
| Dashboard | **Today** | Action feed + pulse strip + incoming + cash out; mobile-first |
| Q4 Targets | **Goals** | Any period (month, quarter, year, launch); Q4 2026 becomes the first goal |
| Purchase Orders, Manufacturing | **Orders** → Inbound · Wholesale · Payments | Inbound = factory runs joined to 3PL receiving; Wholesale = buyer POs; Payments = cash-out calendar for both |
| Inventory | **Inventory** | Forecast + stock curve + planning inputs + sell-through |
| (none) | **Profit** | Monthly P&L (Shopify-derived vs book), margin by channel and SKU, costs |
| Timeline | Timeline | Keep |
| Campaigns | Campaigns | Keep |
| Vendors, Products | **Catalog** → Products · Partners | `vendors.kind`: factory, retailer, 3PL, other |
| Settings | Settings → Connections · Notifications · Team | Connector health moves here from Slack |
| (none) | **Inbox** (bell in the topbar) | The notifications table |

---

## 6. The plan

Six phases. Each is shippable on its own, each reuses the last. Effort is for one focused
engineer (or agent sessions) and assumes Paul answers the decisions in §8 up front.

### Phase 0 — Foundation week (1 week)

Goal: one source of truth for Shopify, an instant shell, and the cheap consistency fixes.
Nothing here is visible as a feature, everything later depends on it.

1. **One Shopify fact table.** Extend `lib/targets/sync.ts` windows from "Q4 only" to a
   rolling trailing 24 months plus the active goal windows (resumable watermarks already
   exist). Point the Dashboard revenue tiles and the digest at `shopify_orders` /
   `shopify_daily_sales`. Deprecate `shopify_metrics` and the 2h orders cron (keep the
   inventory and product pulls). Acceptance: Dashboard DTC 30-day net equals the Targets
   DTC section for the same dates.
2. **Instant shell.** Replace the layout's five-query preamble with one RPC
   (`nav_counters()`) and cache it per user for 60 s; invalidate from the write paths with
   `revalidateTag`. Enable `cacheComponents: true`, drop `force-dynamic` exports, wrap
   each page's data sections in `Suspense`, export `unstable_instant` on the main routes so
   the build fails if a page would block navigation. Supabase cookies are read outside
   cached scopes and the user id is passed in (shared-state RLS makes this safe today).
3. **Chrome consistency.** `PageHeader` on Dashboard, Inventory, Timeline; `loading.tsx`
   for Inventory; `error.tsx` and `not-found.tsx` under `app/(app)`; one `formatDate` in
   `lib/format.ts`; nav grouped per §5 with "Q4 Targets" renamed "Goals" (route alias
   kept).
4. **Wholesale demand in the forecast.** `lib/inventory/load.ts` subtracts open
   `po_line_items` quantities (status not draft/cancelled/closed, not yet shipped) from
   supply on their cancel date. One of the highest-leverage ten-line changes in the repo.
5. **Surface what is already synced.** On Manufacturing, show the matching ShipHero inbound
   PO per run ("At 3PL: 1,200 of 5,000 received, closed Oct 14") and a "Discrepancies"
   strip from `loadInboundDiscrepancies`. Match on a new `manufacturing_runs.shiphero_po_number`
   (editable, suggested by vendor + SKU + quantity).
6. **Connector health in-app.** Re-enable `/api/cron/health` writing to a `connector_health`
   table; Settings and the Today pulse strip read it. No Slack required.

### Phase 1 — Orders command center (2–3 weeks)

Goal: the single place that answers "what is coming, what is going out, what do I owe".

**Data model**

- `payments` generalised from `po_payments`: `(id, entity_type run|purchase_order,
  entity_id, label deposit|balance|other, amount, due_date, paid, paid_date, method,
  reference)`. Migrate `po_payments` rows; the email agent's `record_payment` tool gains
  run support.
- `entity_events` (append-only audit): `(entity_type, entity_id, field, old, new, source
  user|agent|shiphero|shopify, actor, created_at)`, populated by a trigger on date and
  status columns of runs and POs. Powers "slipped by 14 days", vendor on-time rate, and the
  activity tab on every sheet.
- `vendors.kind` enum + rename labels (Buyer / Factory / 3PL).
- `manufacturing_runs`: `shiphero_po_number`, `pi_number`, `incoterms`, `freight_mode`
  (air|sea, replaces the two-column guess once the run ships).

**UI**

- `/orders` with three tabs. **Inbound**: each run as a journey row (Ordered → In production
  → Complete → In transit → Receiving x/y → On shelf) with ETA, slip badge, next payment,
  landed unit cost; board and list preserved. **Wholesale**: today's PO board and list,
  plus the reconcile strip (shipped by 3PL but not booked; booked but not shipped).
  **Payments**: calendar and list of cash out (deposits, balances, labels) and cash in
  (invoiced POs, paid dates), 30/60/90 totals.
- Entity routes: `/orders/inbound/[id]`, `/orders/wholesale/[id]` as full pages, with
  `(.)` intercepting routes so navigation from a list still opens the existing sheets.
  `?open=` redirects to the new URLs. Every sheet gets an **Activity** tab from
  `entity_events` and the existing Correspondence panel.
- Landed cost hand-off: when a run reaches `received`, propose writing its landed per-unit
  cost to `product_cost_history` (Phase 4 table, created here) with a one-click confirm.

**Acceptance:** a factory ETA change by email shows up as a slip badge on Inbound within one
radar run; every deposit on every open run appears on Payments with a due date; a
Slack-era `?open=` link still lands on the right record.

### Phase 2 — Notifications and Today (2 weeks)

Goal: the tool talks. The feature Paul asked for first.

**Data model**

- `notifications (id, kind, severity action|watch|info, entity_type, entity_id, title,
  body, href, dedupe_key unique, created_at, read_at, resolved_at, snoozed_until,
  resolved_reason)`.
- `notification_preferences (user_id, kind, channels jsonb {inapp, email, slack, push},
  quiet_hours)`.
- `notification_deliveries (notification_id, channel, status, provider_id, sent_at)`.

**Rules engine** (`lib/notify/rules/*`, one file per kind, pure functions, unit tested,
run every 15 minutes by the existing `slack-triggers` slot and synchronously after relevant
writes):

| Kind | Fires when | Source |
|---|---|---|
| `payment_due` / `payment_overdue` | 7/3/0 days before, then weekly | `payments` |
| `cancel_date_approaching` / `cancel_date_passed` | 14/7/0 days | `po_line_items` |
| `eta_slipped` / `eta_passed` | date moved later or passed | `entity_events`, runs |
| `run_stalled` | no counterparty reply ≥ 5 days (agent flag) | radar |
| `email_needs_review` | inbound message unlinked | `inbound_messages` |
| `received` / `short_receipt` | 3PL closed a PO; received ≠ ordered | `shiphero_inbound_pos` |
| `shipped_not_booked` | 3PL shipped a wholesale order with no PO | reconcile |
| `reorder_now` / `reorder_soon` | forecast status transitions | forecast |
| `goal_pace_change` | projection crosses a tier, or drops > X% week over week | goals |
| `margin_below_guardrail` | a closed week's net margin < guardrail | profit |
| `connector_stale` / `sync_failed` | health, `runCronJob` | health |

Auto-resolve when the underlying condition clears (paid, received, replied) so the inbox
is a to-do list, not a log.

**Channels**

- **In-app**: bell with unread count in the Topbar, `/inbox` page, and the Today feed.
  Actions inline: open, mark paid, advance stage, snooze (1d/7d/until date), resolve, ask
  analyst.
- **Email** (Resend + React Email): per-notification for `action` severity if the user opts
  in; a daily digest at a user-chosen local time that **only sends when something is new or
  changed since the last one** (the exact complaint that killed the Slack digest); a
  Monday weekly summary that always sends (goal pace, incoming, cash out, reorders).
- **Slack**: `sendSlack` becomes one channel adapter behind the same preferences; re-enable
  per kind, not globally.
- **Push**: web push via the PWA route (manifest + service worker) for `action` severity.
  Phone is the real use case for "send me notifications".

**Today** (replaces Dashboard)

- Pulse strip: data freshness, goal pace chip, cash as-of, open inbound units, cash out
  next 30 days.
- Feed: Needs action today · This week · Watching, each row with the entity, the why, the
  when, and one primary action. Mobile-first single column.
- Right rail (desktop): next five arrivals with receiving progress; payments due next 30
  days; SKUs in the reorder window; goal mini-bar.
- Keep the existing KPI tiles under a "Metrics" tab for people who want the wall.

**Acceptance:** Paul gets an email at 7am ET only on days something changed; tapping it on
a phone opens the record; marking it paid from the inbox clears the notification; the
Slack channel can be re-enabled for `payment_overdue` only.

### Phase 3 — Goals, growth, projections (2–3 weeks)

Goal: the Targets page outlives Q4 and the forecast becomes a planning tool.

**Goals**

- `goals (id, name, period_type month|quarter|year|custom, start, end, tiers jsonb,
  guardrails jsonb, rules jsonb, baseline_start, baseline_end, status)`; migrate the
  `q4_2026` settings row into it. Sync windows derive from active goals plus the rolling
  history. `/goals` lists periods; `/goals/[id]` is today's targets page unchanged except
  for the period. Auto-create the next period from the last as a draft.
- A standing **monthly** goal is the default for a brand that has no quarter plan.

**Growth** (`/goals` overview or a Growth tab)

- Monthly net sales by channel for 24 months with YoY, new vs returning, AOV, discount
  rate, return rate, top and declining SKUs, all from `shopify_orders`. Same classification
  rules as the goal pages, so every number matches.

**Inventory**

- Per-product planning inputs: `lead_time_days`, `safety_stock_days`, `moq`, `case_pack`,
  `reorder_multiple`; reorder quantity rounds to orderable units.
- `/inventory/[sku]`: 12-month stock curve (on hand, minus projected DTC and committed
  wholesale demand, plus incoming by arrival date), stockout and order-by markers,
  seasonality and YoY shown as the inputs they are.
- Scenario sliders on that page: move an incoming arrival, change a quantity, add a
  hypothetical wholesale PO; the curve and dates update client-side from the same pure
  engine (`forecastSku` is already pure).
- **Draft a run** from any reorder row: prefilled `RunForm` (vendor from the last run for
  the SKU, quantity, lead-time-based ETA). The forecast now ends in an order.
- Build the **sell-through** module per `docs/SELL-THROUGH-PLAN.md` (Revolve CSV first).
  Its parser and review dialog also become the CSV foundation Phase 5 needs.

**Acceptance:** Jan 2 2027 shows a live Q1 or January goal with no code change; the
forecast for a SKU with an open 5,000-unit Revolve PO shows the draw-down; a reorder can be
turned into a run in two clicks.

### Phase 4 — Profitability (2–3 weeks)

Goal: profit after cost, every month, by channel and SKU, from real costs.

**Costs**

- `product_cost_history (product_id, effective_from, landed_unit_cost, source run|manual,
  run_id, qty)`; margin math uses the cost effective at the sale date. Runs feed it on
  receipt (Phase 1 hook); manual entries remain possible.
- Fees: Shopify Payments fees from order transactions where available, else a configurable
  rate; returns at cost; wholesale compliance labels and freight from PO fields.
- Ad spend: keep weekly manual entry as the floor, add a CSV import (Meta and Google
  exports) and then a **Meta Marketing API** connector (daily spend by account, the largest
  line for most Shopify brands). Google Ads and TikTok follow the same adapter shape.

**Views**

- `/profit`: monthly management P&L for the trailing 12 months. Rows: net sales by channel
  (Shopify-derived), wholesale invoiced (POs), COGS, fulfillment (postage + rate card),
  payment fees, ad spend, other opex, contribution, net. Columns: months, with the QB book
  P&L beside each month when Phase 5 lands and a variance column.
- Margin by **channel** and by **SKU** for any month range, ranked, with the cost basis
  shown. Wholesale margin per retailer from PO line prices minus landed cost minus labels
  and freight.
- Order-level unit economics as a drill-down (`shopify_orders` × lines × cost × postage ×
  fees), exportable.
- The weekly Targets profitability panel becomes a view over the same functions.

**Acceptance:** "What was contribution margin by channel in September" is answerable
without entering anything; a landed-cost change on a received run moves the margin from
that date forward only.

### Phase 5 — QuickBooks and P&L upload (2 weeks + Intuit review lead time)

Goal: book numbers in the app, by any route the brand has available.

- **Upload first.** QBO "Profit and Loss" and "Balance Sheet" exports (XLSX, CSV, PDF) →
  `financial_statements (id, kind, source upload|quickbooks|connector, period_start,
  period_end, granularity, file_sha256, raw)` + `financial_lines (statement_id,
  account_path, account_name, section revenue|cogs|opex|other_income|other_expense|
  asset|liability|equity, period, amount)`. Deterministic parser for the QBO export layout
  (indented account rows, one column per month when displayed by month), the Phase 3 CSV
  machinery for CSV, the existing Gemini pipeline for PDF with a review step. A saved
  account-to-row mapping (like the QB class mapping that exists today) feeds `/profit`.
- **Connector bridge.** The daily Claude routine writes monthly P&L lines through the same
  `financial_lines` table (via the QuickBooks connector's P&L tool) instead of one thin
  `qb_financials` row, so upload and routine produce identical data.
- **Real OAuth when going SaaS.** The puller and OAuth routes exist
  (`lib/pullers/quickbooks.ts`, `app/api/oauth/quickbooks/*`); the remaining work is the
  Intuit production-app checklist (EULA and privacy URLs, app assessment, production keys)
  and extending the puller to monthly P&L by account. Do this when Phase 6 starts; it is
  table stakes for other brands, not for Greedy this quarter.
- **Reconciliation view** on `/profit`: Shopify-derived vs book, month by month, with the
  usual explanations surfaced (wholesale invoiced in a different month, returns timing,
  unclassified income).

**Acceptance:** Paul drops a QBO P&L export on `/profit` and sees book revenue, COGS and
net income by month beside the Shopify-derived numbers within a minute; cash and AR on
Today are no older than the last upload or routine run and say so.

### Phase 6 — Fluidity, platform, SaaS readiness (ongoing, 2–3 weeks concentrated)

- **Optimistic everything**: `useOptimistic` for status, paid, done, snooze, stage moves;
  server actions return the row; undo toasts.
- **Keyboard**: j/k row navigation, Enter opens, Esc closes, ⌘K actions scoped to the
  focused record ("Mark paid", "Advance stage", "Draft reorder", "Ask about this").
- **Analyst upgrades**: read tools for goals, inbound journey, fulfillment, profit and
  book P&L; contextual entry points on every sheet; the inbox row "ask why" sends the
  notification as context; Slack bot shares all of it (same `makeGlowTools`).
- **Mobile**: tables collapse to cards under `sm`; boards become stacked lists; Today and
  Inbox are the phone surface; PWA install.
- **Shopify webhooks** (`orders/create`, `orders/updated`, `inventory_levels/update`,
  `fulfillments/create`) with the 6h cron as reconciliation, per the SaaS plan. Removes the
  "data as of 4 hours ago" ceiling.
- **Trust and ops**: encrypt `connector_credentials` (Supabase Vault), regenerate
  `types/db.ts` from the schema in CI, Playwright smoke tests for the four pillars, a
  `/status` page from `connector_health`.
- **Tenancy** (only once Greedy runs on the above daily): apply migrations `0015`–`0018`
  behind the documented tripwire, then the embedded Shopify app flow in
  `docs/SAAS-CONVERSION-PLAN.md`. Phases 1–5 are written tenant-agnostic (rules and
  settings as data, connectors behind interfaces, RPCs with `security invoker`) so this is
  additive.

---

## 7. Sequencing and effort

| Phase | Delivers | Effort | Depends on |
|---|---|---|---|
| 0 Foundation | one Shopify truth, instant shell, consistency, wholesale demand in forecast, 3PL receiving visible | 1 wk | — |
| 1 Orders | inbound journey, payments ledger for runs, date history, entity URLs | 2–3 wks | 0 |
| 2 Notifications + Today | rules engine, inbox, email, push, Slack adapter, Today feed | 2 wks | 1 |
| 3 Goals + inventory | periods, growth view, stock curve, scenarios, draft-a-run, sell-through | 2–3 wks | 0 |
| 4 Profitability | cost history, fees, ad spend connector, monthly P&L, margin by channel and SKU | 2–3 wks | 1, 3 |
| 5 QuickBooks + upload | statements tables, upload parser, routine bridge, reconciliation | 2 wks (+ Intuit lead time) | 4 |
| 6 Fluidity + platform | optimistic UI, keyboard, analyst, mobile, webhooks, vault, tests, tenancy | 2–3 wks + ongoing | all |

Roughly 12–16 focused weeks to the full picture; Paul's first reason for building the tool
(POs, dates, notifications) is covered by the end of Phase 2, in 5–6 weeks. Phases 3 and 4
can run in parallel if two streams are available.

### First five days (if nothing else happens)

1. Wholesale PO lines subtract from forecast supply (`lib/inventory/load.ts`).
2. Nav counters as one cached RPC; drop `fetchTimelineEvents` from the layout.
3. ShipHero receiving progress and discrepancies on `/manufacturing`.
4. Dashboard revenue tiles on `shopify_orders`; sync window widened.
5. `PageHeader` everywhere, inventory skeleton, `error.tsx`, shared `formatDate`,
   `vendors.kind`.

---

## 8. Decisions needed from Paul

1. **Notification channels.** Slack was switched off "while notifications move to another
   platform". Proposed default: in-app + email digest (change-detecting) + push on phone,
   with Slack re-enabled per rule. Confirm, or name the platform.
2. **QuickBooks path.** Upload-first now, connector routine as the bridge, Intuit
   production app when SaaS starts. Or push the Intuit checklist through now?
3. **Goal periods.** Monthly rolling goal by default plus quarterly plans? Which tiers for
   Q1 2027?
4. **Ad platforms.** Meta first? Is Google or TikTok spend material?
5. **Wholesale demand.** Treat open PO line quantities as committed demand on their cancel
   date (proposed yes).
6. **Sell-through.** The eight open questions in `docs/SELL-THROUGH-PLAN.md` have been
   waiting since July; answering them unblocks Phase 3's last item.
7. **SaaS timing.** Keep building single-tenant and tenant-agnostic, apply tenancy after
   Phase 4 (proposed), or start the Shopify embedded app in parallel?

---

## 9. Risks and how the plan handles them

| Risk | Mitigation |
|---|---|
| Vercel function time budgets on wider Shopify backfills | Watermarked, resumable sync already exists; backfill in `targets_sync_runs`-tracked chunks; webhooks in Phase 6 shrink the polling load |
| ShipHero shared credit bucket (Retroship's account) | Keep 6h cadence; shipments pull only the active windows; no new per-page calls (read from mirrors only) |
| Model cost and latency of the daily radar across more orders | Radar is already idempotent; run only entities with new mail or passed dates; Gemini fallback exists |
| Hand-maintained `types/db.ts` drifting as tables are added | Generate from the schema in Phase 0 and check in CI |
| No DB transactions in the app layer | Multi-row writes (payments migration, statement import) go through RPCs |
| Notification fatigue recreating the digest problem | Rules fire on transitions, auto-resolve, dedupe by key, digest only on change, per-kind preferences |
| Two revenue models during the switch | Phase 0 ships the comparison first and only removes `shopify_metrics` after a week of matching numbers |
| Cached segments serving stale operational data | Short `cacheLife` (60 s) on counters, tag invalidation from every write path, freshness shown on every surface |

---

## Appendix A — Where things live (for whoever builds this)

| Concern | Files |
|---|---|
| Layout preamble to cache | `app/(app)/layout.tsx`, `lib/dashboard/sync-status.ts` |
| Shopify fact table and sync | `lib/targets/sync.ts`, `lib/targets/classify.ts`, migrations `0023`–`0026` |
| Legacy daily metrics to retire | `lib/pullers/shopify.ts`, `shopify_metrics`, `lib/dashboard/metrics.ts` |
| Forecast engine and loader | `lib/inventory/forecast.ts`, `lib/inventory/load.ts`, `lib/inventory/narrate.ts` |
| Runs, POs, payments | `lib/manufacturing/core.ts`, `lib/purchase-orders/core.ts`, `po_payments` |
| 3PL mirror and reconcile | `lib/pullers/shiphero-*.ts`, `lib/shiphero/reconcile.ts` (no UI consumer today) |
| Email agent and radar | `lib/inbound/*`, `app/api/cron/po-monitor/route.ts` |
| Slack dispatch and digest | `lib/slack/dispatch.ts` (kill switch), `lib/slack/digest.ts`, `lib/slack/briefing.ts` |
| Targets UI and math | `components/targets/*`, `lib/targets/*`, `tests/targets/*` |
| Profit math | `lib/targets/profit.ts`, `lib/targets/profitability.ts`, `lib/targets/fulfillment*.ts` |
| QuickBooks | `lib/pullers/quickbooks.ts`, `lib/quickbooks/client.ts`, `app/api/oauth/quickbooks/*`, `scripts/qb-connector-sync.mjs` |
| Document parsing | `lib/documents/*`, `lib/purchase-orders/parse.ts`, `lib/manufacturing/parse.ts` |
| Analyst | `lib/ai/tools.ts`, `lib/ai/context.ts`, `lib/ai/prompt.ts`, `components/chat/*` |
| Design system | `STYLE.md`, `app/globals.css`, `components/ui/*`, `components/nav/page-header.tsx` |

## Appendix B — Schema additions by phase

| Phase | New or changed |
|---|---|
| 0 | `connector_health`; `manufacturing_runs.shiphero_po_number`; `vendors.kind` |
| 1 | `payments` (replaces `po_payments`); `entity_events`; `product_cost_history`; run fields `pi_number`, `incoterms`, `freight_mode` |
| 2 | `notifications`, `notification_preferences`, `notification_deliveries` |
| 3 | `goals` (replaces `targets_settings`); product planning columns; `wholesale_reports`, `wholesale_report_lines`, `products.upc` (from the sell-through plan) |
| 4 | `ad_spend_daily`; `fee_settings`; views for order unit economics |
| 5 | `financial_statements`, `financial_lines`, `account_mappings` |
| 6 | `shopify_webhook_events`; Vault-backed credentials; tenancy `0015`–`0018` |
