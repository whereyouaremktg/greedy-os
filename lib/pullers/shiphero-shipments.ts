import "server-only";
import { shipHeroRequest } from "@/lib/shiphero/client";
import { createServiceClient } from "@/lib/supabase/service";
import {
  syncShipHeroShipments,
  type ShipmentsDbLike,
  type ShipmentsSyncOptions,
  type ShipmentsSyncSummary,
} from "@/lib/targets/shipments-sync";

// Q4 Targets fulfillment sync — Next-side wrapper around
// lib/targets/shipments-sync.ts. Mirrors ShipHero shipments (label cost,
// carrier, weight) for the tracked Q4 windows into shiphero_shipments so the
// dashboard can treat postage as a cost of goods. Called by
// /api/cron/targets-sync after the Shopify order sync and by the Refresh button.
export async function runShipHeroShipmentsSync(
  opts: Pick<ShipmentsSyncOptions, "budgetMs" | "trigger">,
): Promise<ShipmentsSyncSummary> {
  const db = createServiceClient() as unknown as ShipmentsDbLike;
  return syncShipHeroShipments({ shiphero: { request: shipHeroRequest }, db }, opts);
}
