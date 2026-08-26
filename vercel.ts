import type { VercelConfig } from "@vercel/config/v1";

const config: VercelConfig = {
  // Only `main` deploys; all other branches are ignored unless added here.
  git: {
    deploymentEnabled: {
      main: true,
      "*": false,
    },
  },
  crons: [
    // QuickBooks is NOT here: its data now flows from the QuickBooks cloud
    // connector via the daily `glow-os-quickbooks-sync` Claude routine (which
    // upserts qb_financials). The in-app OAuth puller at /api/cron/quickbooks
    // is kept as code for a future "production keys" upgrade, but is unscheduled
    // so it can't fail+alert without production OAuth tokens.
    { path: "/api/cron/shopify", schedule: "0 */2 * * *" },
    // Sales history changes slowly — refresh weekly (Mon 11:00 UTC).
    { path: "/api/cron/shopify-sales-history", schedule: "0 11 * * 1" },
    { path: "/api/cron/klaviyo", schedule: "0 */4 * * *" },
    { path: "/api/cron/hubspot", schedule: "0 */6 * * *" },
    // ShipHero (Retroship 3PL): on-hand + inbound POs + wholesale orders. Every
    // 6h — polite to the shared ShipHero credit bucket (it's Retroship's account).
    { path: "/api/cron/shiphero", schedule: "0 */6 * * *" },
    { path: "/api/cron/slack-triggers", schedule: "*/15 * * * *" },
    // Daily morning briefing (13:00 UTC = 9am ET) — DISABLED 2026-08-26 at
    // Paul's request: it posted every day whether or not anything had changed,
    // so it read as stale. The route (/api/cron/slack-digest) and the digest
    // builder (lib/slack/digest.ts) are untouched — re-enable by uncommenting
    // the line below and pushing to main.
    // { path: "/api/cron/slack-digest", schedule: "0 13 * * *" },
    // Connector watchdog — hourly freshness + OAuth-token check; Slacks
    // #greedy-os (deduped per day) on staleness / disconnect / token expiry.
    { path: "/api/cron/health", schedule: "0 * * * *" },
    // Daily PO/manufacturing radar — re-runs the email extraction agent over
    // every open run + wholesale PO and posts 🔴🟡🟢 status to Slack. Now the
    // only scheduled daily Slack post (the 13:00 briefing is off).
    { path: "/api/cron/po-monitor", schedule: "0 14 * * *" },
  ],
};

export default config;
