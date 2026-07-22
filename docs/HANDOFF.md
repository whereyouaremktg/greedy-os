# Glow OS — Claude Code handoff

**Plan (authoritative):** `/Users/PaulBart/.claude/plans/glow-os-lexical-gosling.md`

## Locked decisions (Paul, May 2026)

| Question | Decision |
|----------|----------|
| Connectors first | **Shopify**, then **QuickBooks** (real pullers before other connectors) |
| Phase 1 priority | **Real UI** — build full CRUD pages (not stub placeholders) for owned modules |
| Duplicate Supabase `greedy-os` (`ocyrmkmrtuahmdsfbqkn`) | **Pause/delete** — canonical project is Vercel-linked `pzkjnnhdymlahjxtqjmx` |
| Additional auth users | **No** — only `paul@`, `marissa@`, `adam@glowbeautyhair.com` |
| Dashboard metrics | **Yes** — implement real KPI tiles from cache + owned data (Phase 3, after connectors feed cache) |
| Git / deploy | **`main` only** — `vercel.ts` `git.deploymentEnabled: { main: true, "*": false }` |

## Infra

| Item | Value |
|------|--------|
| Repo | https://github.com/whereyouaremktg/greedy-os |
| Local path | `/Users/PaulBart/Projects/GLOW OS/glow-os` |
| Production | https://glow-os-bay.vercel.app |
| Vercel | https://vercel.com/whereyouaremktgs-projects/glow-os |
| Supabase (canonical) | `pzkjnnhdymlahjxtqjmx` — https://supabase.com/dashboard/project/pzkjnnhdymlahjxtqjmx |

## Phases 1–4 — done

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Scaffold, schema `0001_phase0_init.sql`, types `types/db.ts`, auth, stub pullers + crons, AI chat via Gateway (`anthropic/claude-opus-4-7`), dashboard shell + chat panel, cloud bootstrap. | done |
| 1 | Real UI for owned modules: Vendors, Products, Purchase Orders (board + list + upload + review + detail), PO payments, Manufacturing (board + table + proforma upload + review + run form), Campaigns (task board + table + form + detail), Timeline (horizon + month + agenda). | done |
| 2a | Shopify Admin API puller; `shopify_metrics` upserts; dashboard tile + sparkline live. | done |
| 2b | QuickBooks OAuth + puller; `qb_financials` upserts; cash / AR aging / revenue / channel mix tiles live. | done |
| 3 | Dashboard KPIs with `synced_at` + stale badges, animated values, sparklines, channel mix card and stacked revenue chart. | done |
| 4 | Slack identity mapping + alerts (shipped out of order, ahead of the original plan). | done |

## Current state

- **Deployed 2026-07-21:** `main` pushed (`83441e2..377d272`) and Vercel build green — prod now carries global search, the dashboard workspace refactor, PO delete, and the premium UI pass. Before this, everything since Jul 2 sat uncommitted in the working tree; **commit + push at the end of a session or it does not ship.** Tenancy migrations 0015–0018 are versioned but still NOT applied to prod (DB remains single-tenant).
- **Phase 5 — Polish & expand.** Focus is UI/UX consistency: shared `<PageHeader>` shell, sidebar attention counters, global analyst drawer, dashboard signal cleanup, and skeleton/route-loading parity.
- **Shipped July 2026: global search (⌘K palette).** Fixed a crash: `components/ui/command.tsx` rendered cmdk `CommandInput/List` without the cmdk `<Command>` root, so opening the palette threw. Now wraps children in `<Command shouldFilter={shouldFilter}>` inside `DialogContent`. Added real data search: `lib/search/core.ts` (per-column `ilike` over vendors, purchase_orders + po_line_items, products, manufacturing_runs, campaigns; deduped, 5/group, `.throwOnError()`, `*`/`%`/`_` escaped), `lib/actions/search.ts` (`'use server'`, auth-gated), and `components/command/command-palette.tsx` (250ms debounced with requestId race guard + `.catch`, `shouldFilter={false}`, manual filter for static Pages/Actions). Search results deep-link via `?open=<id>`, handled by all 5 module views (PO opens by id through its detail-sheet fetch, so it works for records beyond the first-page list; others `toast.error` on miss). Reviewed by a 3-lens adversarial workflow; all confirmed findings fixed.
- **Planned next module: Wholesale Sell-Through** (Revolve/URBN partner sell-through tracking, `/wholesale`). Full locked plan in `docs/SELL-THROUGH-PLAN.md` — snapshot-ledger data model (0022 migration: `products.upc`, `wholesale_reports`, `wholesale_report_lines`), deterministic CSV parsing (no LLM), YTD = CUM deltas. Not started; blocked on Paul's answers to the plan's open questions (report cadence, URBN delivery format).
- **Shipped July 2026: inbound email → PO/manufacturing monitoring agent** (`docs/INBOUND-EMAIL.md`). Two Postmark streams (`/api/inbound/manufacturing-email` for product@, `/api/inbound/po-email` for receiving@) → `inbound_messages` threads (migration **0022** — sell-through tables must now use **0023**) → link → extraction agent → safe auto-apply → daily `/api/cron/po-monitor` Slack radar (14:00 UTC) + Correspondence UI on run/PO sheets. **Remaining manual step: point Postmark's inbound webhook for product@glowbeautyhair.com at the manufacturing URL, and add factory/buyer domains to `INBOUND_EMAIL_ALLOWED_SENDERS`.**
- **Shipped July 2026: premium UI pass (PO tracker + dashboard).** New `PoStatusBadge` (per-stage hue: draft neutral → confirmed brand → fulfillment sky → shipped violet → delivered teal → paid emerald; `poStatusDotClass` feeds board column dots). PO list rebuilt: buyer monograms, uppercase micro headers, hover rows, urgency-aware cancel dates (red/amber + days chip only when overdue/≤7d — was all-red). Board: solid rounded-xl columns (no more dashed), card hover lift, total in card header, short cancel dates ("Jun 23") so overdue chips don't truncate. Base `Card` gained `shadow-xs`; KPI headline 26px/leading-none; sparkline gradient 0.2; PageHeader compacted to text-xl. globals.css: brand `::selection` + thin scrollbars. Verified light+dark via a temporary mock-data route (deleted).
- **Shipped July 2026: PO delete.** `deletePurchaseOrderCore` (`lib/purchase-orders/core.ts`) + `deletePurchaseOrder` action (`lib/actions/purchase-orders.ts`) + destructive "Delete this PO" section with confirm Dialog at the bottom of `po-detail-sheet.tsx` (nested Base UI dialog over the sheet — supported, stacks fine). DB: `po_line_items`/`po_payments` cascade; `manufacturing_runs.purchase_order_id` + inbound email log FK are `on delete set null`; `inbound_messages.matched_entity_id` has no FK so correspondence rows just orphan silently. Revalidates timeline + `/purchase-orders` + `/vendors`. Pre-existing lint failures (10× `react-hooks/set-state-in-effect`, unrelated files/effects) still stand — not introduced here.
- **Open connector work:** HubSpot is still a stub puller — engineering work, not UI. Klaviyo remains stubbed beyond what the analyst chat reads.
- **Out of scope for now:** mobile nav, per-tile click-through detail drawers, sidebar counter realtime refresh.

### QuickBooks pipeline = cloud connector (decided June 2026)

**QB no longer uses the in-app OAuth puller.** Its production keys require an
Intuit production-app onboarding gauntlet (EULA/privacy URLs, etc.) that wasn't
worth it. Instead QB data flows from the **QuickBooks cloud connector (the
QuickBooks MCP)**, which is already authorized to the real **Glow Beauty**
company — zero Intuit hoops.

- Daily routine `glow-os-quickbooks-sync` (7:06am ET) calls the connector's
  report tools (balance sheet, AR/AP aging, P&L) and upserts `qb_financials`
  via `scripts/qb-connector-sync.mjs` (stdin JSON → upsert on `as_of_date`).
- `/api/cron/quickbooks` (in-app OAuth puller) is **removed from `vercel.ts`**
  but kept as code for a future "production keys" upgrade to 24/7 unattended.
- Tradeoff: the routine refreshes **when the Claude app is open**, not 24/7.
  `STALE_AFTER.qb` was relaxed to 30h to match the daily cadence.
- One-time backfill done 2026-06-22 (cash $431,886, AR $92,173, AP $14,868).

Root cause of the original outage (for the record): QB's OAuth runtime tokens
were wiped from `connector_credentials` (and later the `client_id`/`secret`
too, by a Settings blank-save bug — now fixed). The 6h cron threw
`MissingCredentialsError` for ~26 days with no alarm; `qb_financials` froze at
`2026-05-26`.

### Observability — connector health + alerting (June 2026)

So a pipeline can't silently rot again:
- `runCronJob(name, job)` posts a deduped Slack alert (`lib/alerts.ts`) to
  `#greedy-os` on any cron failure. All cron routes pass their name.
- `lib/health/connectors.ts` + `/api/health` (read, CRON_SECRET-gated, 503 when
  unhealthy) + `/api/cron/health` (hourly, alerts on stale connectors).
  Freshness for quickbooks/shopify/klaviyo/shiphero; QB is freshness-only now
  (no token to check). `hubspot` "never" is report-only (still a stub).
- Daily Claude routine `glow-os-connector-health` (8:34am ET) curls
  `/api/health` and posts a heartbeat / problem summary to `#greedy-os`.
- **NOTE:** `/api/health`, `/api/cron/health`, and cron alerting go live only
  once `main` is **deployed**. The QB connector sync + backfill already work.

## Hard rules

- `nvm use` + **pnpm** only  
- No `@ai-sdk/anthropic`; no `runtime: "edge"`  
- `lib/supabase/service.ts` server-only  
- Regen `types/db.ts` after migrations  
- Shared-state RLS on OWNED tables — don’t tighten without sign-off  
- **main-only** branches unless Paul specifies otherwise  

## Local dev

```bash
cd "/Users/PaulBart/Projects/GLOW OS/glow-os"
nvm use && pnpm install
vercel env pull .env.local
pnpm dev
```

## Env (connector — add as each lands)

```bash
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REFRESH_TOKEN=
QUICKBOOKS_REALM_ID=
```
