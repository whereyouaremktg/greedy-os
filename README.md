# Greedy OS

Operations command center for Greedy Selfish Haircare (formerly Glow Beauty): purchase orders,
manufacturing runs, campaigns, inventory, connector pulls (Shopify, ShipHero/RetroShip,
QuickBooks) and the **Q4 Targets** dashboard.

- Stack: Next.js 16 (app router) · React 19 · Tailwind v4 + shadcn · Supabase (auth + Postgres) ·
  Vercel (hosting + crons) · Vercel AI Gateway (analyst chat, document parsing).
- Status, decisions and runbooks: `docs/HANDOFF.md`. Design system: `STYLE.md`.
- Q4 Targets data rules (what counts as revenue, seeding, pace): `docs/Q4-TARGETS.md`.

## Local dev

```bash
nvm use            # Node 24
pnpm install
vercel env pull .env.local
pnpm dev
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Data pipes

| Pipe | Mechanism | Cadence |
|---|---|---|
| Shopify sales + inventory | `/api/cron/shopify` | every 2h |
| Shopify orders for Q4 Targets | `/api/cron/targets-sync` (+ manual Refresh) | every 6h |
| Shopify SKU sales history | `/api/cron/shopify-sales-history` | weekly |
| ShipHero / RetroShip | `/api/cron/shiphero` | every 6h |
| HubSpot deals | `/api/cron/hubspot` | every 6h |
| QuickBooks | manual / stale since 2026-06-22 — dashboard uses overrides | — |
| Klaviyo | not connected (puller is a stub, unscheduled) | — |

Migrations live in `supabase/migrations/` and are applied by hand against the production
project (see `docs/HANDOFF.md`); regenerate or hand-extend `types/db.ts` after each one.
