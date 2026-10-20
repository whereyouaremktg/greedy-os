// Run the Q4 Targets Shopify order sync from a shell (backfills, repairs).
//
//   pnpm exec tsx scripts/targets-sync.ts [--budget-ms 600000] [--window q4_2025]
//
// Reads SHOPIFY_STORE_DOMAIN + SHOPIFY_CLIENT_ID/SECRET (or
// SHOPIFY_ADMIN_ACCESS_TOKEN) and NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY from the environment (.env.local is loaded when
// present). Writes shopify_orders / shopify_order_lines and the sync state,
// exactly like the cron route — same code path (lib/targets/sync.ts).

import { readFileSync } from "node:fs";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { createClient } from "@supabase/supabase-js";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import { defaultWindows, syncShopifyOrders, type DbLike } from "@/lib/targets/sync";

function loadDotEnv(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local — rely on the environment
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadDotEnv();
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!domain || !url || !key) {
    console.error("Missing SHOPIFY_STORE_DOMAIN, NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const accessToken = await resolveShopifyAccessToken(domain);
  const shopify = createAdminApiClient({ storeDomain: domain, apiVersion: "2026-01", accessToken, retries: 2 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as DbLike;

  const onlyWindow = arg("--window");
  const windows = defaultWindows().filter((w) => !onlyWindow || w.key === onlyWindow);
  const budgetMs = Number(arg("--budget-ms") ?? 20 * 60 * 1000);

  const summary = await syncShopifyOrders(
    { shopify, db },
    { windows, budgetMs, trigger: "backfill", log: (m) => console.log(new Date().toISOString(), m) },
  );
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.complete) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
