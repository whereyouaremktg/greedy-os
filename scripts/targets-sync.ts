// Run the Q4 Targets syncs from a shell (backfills, repairs).
//
//   pnpm exec tsx scripts/targets-sync.ts [--job shopify|shipments|all] [--budget-ms 600000] [--window q4_2025]
//
// `--job shipments` mirrors ShipHero shipments (label cost) into
// shiphero_shipments; it needs the ShipHero refresh token in
// connector_credentials (read through the service key) and nothing from Shopify.
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
import {
  defaultShipmentWindows,
  syncShipHeroShipments,
  type ShipmentsDbLike,
  type ShipHeroLike,
} from "@/lib/targets/shipments-sync";

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

async function shipHeroFromDb(url: string, key: string): Promise<ShipHeroLike> {
  // Same token dance as lib/shiphero/auth.ts, without the server-only import.
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await sb.from("connector_credentials").select("key, value").eq("connector", "shiphero");
  const creds = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  let token = creds.access_token;
  const fresh = creds.access_token_expires_at && Date.parse(creds.access_token_expires_at) - Date.now() > 86_400_000;
  if (!token || !fresh) {
    if (!creds.SHIPHERO_REFRESH_TOKEN) throw new Error("ShipHero refresh token missing in connector_credentials");
    const res = await fetch("https://public-api.shiphero.com/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: creds.SHIPHERO_REFRESH_TOKEN }),
    });
    if (!res.ok) throw new Error(`ShipHero token refresh failed (${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    token = j.access_token;
    await sb.from("connector_credentials").upsert(
      [
        { connector: "shiphero", key: "access_token", value: token },
        { connector: "shiphero", key: "access_token_expires_at", value: new Date(Date.now() + j.expires_in * 1000).toISOString() },
      ],
      { onConflict: "connector,key" },
    );
  }
  return {
    request: async <T,>(query: string, variables?: Record<string, unknown>) => {
      const res = await fetch("https://public-api.shiphero.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }>; extensions?: { throttling?: unknown } };
      if (json.errors?.length) throw new Error(`ShipHero: ${json.errors.map((e) => e.message).join("; ")}`);
      return { data: json.data as T, throttling: json.extensions?.throttling as never };
    },
  };
}

async function main() {
  loadDotEnv();
  const job = (arg("--job") ?? "shopify") as "shopify" | "shipments" | "all";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const onlyWindow = arg("--window");
  const budgetMs = Number(arg("--budget-ms") ?? 20 * 60 * 1000);
  const log = (m: string) => console.log(new Date().toISOString(), m);
  let exitCode = 0;

  if (job === "shopify" || job === "all") {
    const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
    if (!domain) {
      console.error("Missing SHOPIFY_STORE_DOMAIN");
      process.exit(1);
    }
    const accessToken = await resolveShopifyAccessToken(domain);
    const shopify = createAdminApiClient({ storeDomain: domain, apiVersion: "2026-01", accessToken, retries: 2 });
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as DbLike;
    const windows = defaultWindows().filter((w) => !onlyWindow || w.key === onlyWindow);
    const summary = await syncShopifyOrders({ shopify, db }, { windows, budgetMs, trigger: "backfill", log });
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.complete) exitCode = 2;
  }

  if (job === "shipments" || job === "all") {
    const shiphero = await shipHeroFromDb(url, key);
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as ShipmentsDbLike;
    const windows = defaultShipmentWindows().filter((w) => !onlyWindow || w.key === onlyWindow);
    const summary = await syncShipHeroShipments({ shiphero, db }, { windows, budgetMs, trigger: "backfill", log });
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.complete) exitCode = 2;
  }

  process.exitCode = exitCode;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
