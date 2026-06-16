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
    { path: "/api/cron/quickbooks", schedule: "0 */6 * * *" },
    { path: "/api/cron/shopify", schedule: "0 */2 * * *" },
    // Sales history changes slowly — refresh weekly (Mon 11:00 UTC).
    { path: "/api/cron/shopify-sales-history", schedule: "0 11 * * 1" },
    { path: "/api/cron/klaviyo", schedule: "0 */4 * * *" },
    { path: "/api/cron/hubspot", schedule: "0 */6 * * *" },
    // ShipHero (Retroship 3PL): on-hand + inbound POs + wholesale orders. Every
    // 6h — polite to the shared ShipHero credit bucket (it's Retroship's account).
    { path: "/api/cron/shiphero", schedule: "0 */6 * * *" },
    { path: "/api/cron/slack-triggers", schedule: "*/15 * * * *" },
    // Daily morning briefing — re-enabled at Paul's request (June 2026), now
    // every day (sales move on weekends too). 13:00 UTC = 9am ET.
    { path: "/api/cron/slack-digest", schedule: "0 13 * * *" },
  ],
};

export default config;
