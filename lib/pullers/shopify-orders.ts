import "server-only";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import { createServiceClient } from "@/lib/supabase/service";
import {
  syncShopifyOrders,
  type DbLike,
  type SyncOptions,
  type SyncSummary,
} from "@/lib/targets/sync";

const API_VERSION = "2026-01";

// Q4 Targets order sync — Next-side wrapper around lib/targets/sync.ts.
// Pulls Shopify orders for the tracked Q4 windows (baseline year + current
// year) into shopify_orders / shopify_order_lines. Incremental after the first
// pass (updated_at watermark per window), so a run normally touches a few
// hundred rows. Called by /api/cron/targets-sync and the dashboard's Refresh.
export async function runShopifyOrdersSync(
  opts: Pick<SyncOptions, "budgetMs" | "trigger">,
): Promise<SyncSummary> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  if (!domain) {
    throw new Error("Shopify credentials missing: SHOPIFY_STORE_DOMAIN is not set");
  }
  const accessToken = await resolveShopifyAccessToken(domain);
  const shopify = createAdminApiClient({
    storeDomain: domain,
    apiVersion: API_VERSION,
    accessToken,
    retries: 2,
  });
  const db = createServiceClient() as unknown as DbLike;
  return syncShopifyOrders({ shopify, db }, opts);
}
