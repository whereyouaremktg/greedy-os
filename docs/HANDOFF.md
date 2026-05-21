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

## Phase 0 — done

Scaffold, schema `0001_phase0_init.sql`, types `types/db.ts`, auth, stub pullers + crons, AI chat via Gateway (`anthropic/claude-opus-4-7`), dashboard shell + chat panel, cloud bootstrap verified.

## Recommended build order

1. **Phase 1 — Real UI (owned modules)**  
   Vendors → POs → PO payments → Manufacturing → Campaigns  
   Pattern: server pages + `lib/actions/*` + shadcn Form/zod + Table/Sheet.

2. **Phase 2a — Shopify** (first connector)  
   Replace `lib/pullers/shopify.ts` with Admin API; env: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`.  
   Upsert `shopify_metrics`; verify cron + dashboard tile.

3. **Phase 2b — QuickBooks** (second connector)  
   OAuth env vars in `.env.example`; replace `lib/pullers/quickbooks.ts`; upsert `qb_financials`.

4. **Phase 3 — Dashboard KPIs**  
   Real tiles: cash, AR aging, revenue, Shopify revenue/AOV, wholesale pipeline (HubSpot still stub until later), PO overdue, manufacturing stages.  
   `synced_at` + stale badges; add Recharts when charting.

5. **Later:** Klaviyo, HubSpot pullers; Phase 4 Slack.

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
