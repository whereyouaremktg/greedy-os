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
    { path: "/api/cron/klaviyo", schedule: "0 */4 * * *" },
    { path: "/api/cron/hubspot", schedule: "0 */6 * * *" },
    { path: "/api/cron/slack-triggers", schedule: "*/15 * * * *" },
    // Daily morning briefing, weekdays at 13:00 UTC (~8-9am US Eastern).
    { path: "/api/cron/slack-digest", schedule: "0 13 * * 1-5" },
  ],
};

export default config;
