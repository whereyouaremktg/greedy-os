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

- **Phase 5 — Polish & expand.** Focus is UI/UX consistency: shared `<PageHeader>` shell, sidebar attention counters, global analyst drawer, dashboard signal cleanup, and skeleton/route-loading parity.
- **Open connector work:** HubSpot is still a stub puller — engineering work, not UI. Klaviyo remains stubbed beyond what the analyst chat reads.
- **Out of scope for now:** mobile nav, per-tile click-through detail drawers, sidebar counter realtime refresh.

### Observability — connector health + alerting (June 2026)

Root cause of the May–June QuickBooks outage: its OAuth runtime tokens
(`refresh_token` / `access_token` / `realm_id` / expiries) were wiped from
`connector_credentials`, leaving only `client_id` / `client_secret`. The cron
threw `MissingCredentialsError` every 6h for ~26 days with **no alarm**.
`qb_financials` froze at `2026-05-26`. Fix = reconnect OAuth at `/settings`
(only Paul/Marissa can complete the Intuit consent).

Hardening added so it can't silently rot again:
- `runCronJob(name, job)` now posts a deduped Slack alert (`lib/alerts.ts`) to
  `#greedy-os` on any cron failure. All 8 cron routes pass their name.
- `lib/health/connectors.ts` + `/api/health` (read, CRON_SECRET-gated, 503 when
  unhealthy) + `/api/cron/health` (hourly, alerts on stale / disconnected /
  token-expiring). Checks freshness for quickbooks/shopify/klaviyo/shiphero and
  QuickBooks OAuth token expiry. `hubspot` "never" is report-only (still a stub).
- Daily Claude Code routine `glow-os-connector-health` (8:34am ET) curls
  `/api/health` and posts a heartbeat / problem summary to `#greedy-os`.
- **NOTE:** `/api/health`, `/api/cron/health`, and the cron alerting only go
  live once `main` is **deployed**. Reconnect works against current prod today.

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
