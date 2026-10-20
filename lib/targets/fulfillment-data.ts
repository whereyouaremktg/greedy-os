// Server read model for the fulfillment section: weekly facts from the
// targets_fulfillment_weekly RPC (Shopify orders ⋈ ShipHero shipments),
// carrier mix, the ShipHero sync status, and the quarter roll-up. Pure math
// lives in lib/targets/fulfillment.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { REVENUE_BUCKETS, type Bucket } from "@/lib/targets/classify";
import { addDays } from "@/lib/targets/dates";
import {
  computeFulfillmentWeek,
  rollupFulfillment,
  threeplFallback,
  type FulfillmentQuarter,
  type FulfillmentRates,
  type FulfillmentWeek,
  type FulfillmentWeekFacts,
} from "@/lib/targets/fulfillment";
import { weekStartOf } from "@/lib/targets/profit";
import type { DailySalesRow } from "@/lib/targets/profitability";

type DB = SupabaseClient<Database>;

export type CarrierMix = {
  carrier: string;
  method: string;
  shipments: number;
  share: number;
  postage: number;
  avgPostage: number;
  avgWeightLb: number | null;
};

export type FulfillmentSync = {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  ok: boolean | null;
  complete: boolean | null;
  message: string | null;
  /** Newest shipment synced_at. */
  dataAsOf: string | null;
  shipmentsInWindow: number;
};

export type FulfillmentData = {
  hasShipments: boolean;
  rates: FulfillmentRates;
  weeks: FulfillmentWeek[];
  quarter: FulfillmentQuarter;
  carriers: CarrierMix[];
  sync: FulfillmentSync;
  /** Week start → 3PL fallback for the profitability panel. */
  threeplFallbackByWeek: Map<string, number | null>;
};

function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function nn(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Carrier codes as ShipHero reports them → how the team says them. */
export function carrierLabel(code: string): string {
  const map: Record<string, string> = {
    dhl_ecommerce: "DHL eCommerce",
    uni_uni: "UniUni",
    endicia: "USPS (Endicia)",
    shippo__usps: "USPS (Shippo)",
    usps: "USPS",
    ups: "UPS",
    fedex: "FedEx",
    passport: "Passport (intl.)",
    unknown: "Unknown",
  };
  return map[code] ?? code.replace(/_+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getFulfillment(
  db: DB,
  opts: {
    daily: DailySalesRow[];
    window: { start: string; end: string };
    today: string;
    revenueBuckets: Bucket[];
    rates: FulfillmentRates;
  },
): Promise<FulfillmentData> {
  const { daily, window, today, rates } = opts;
  const buckets = opts.revenueBuckets.length > 0 ? opts.revenueBuckets : [...REVENUE_BUCKETS];
  const lastDay = today > window.end ? window.end : today;
  const firstWeek = weekStartOf(window.start);
  const lastWeek = weekStartOf(lastDay);

  const [weeklyRes, carriersRes, runRes, newestRes, countRes] = await Promise.all([
    db.rpc("targets_fulfillment_weekly", { p_start: window.start, p_end: window.end, p_buckets: buckets }),
    db.rpc("targets_fulfillment_carriers", { p_start: window.start, p_end: window.end, p_buckets: buckets }),
    db
      .from("targets_sync_runs")
      .select("started_at, finished_at, ok, complete, message")
      .eq("job", "shiphero_shipments")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("shiphero_shipments").select("synced_at").order("synced_at", { ascending: false }).limit(1).maybeSingle(),
    db
      .from("shiphero_shipments")
      .select("id", { count: "exact", head: true })
      .gte("day_local", window.start)
      .lte("day_local", addDays(window.end, 45)),
  ]);
  if (weeklyRes.error) throw new Error(`targets_fulfillment_weekly: ${weeklyRes.error.message}`);
  if (carriersRes.error) throw new Error(`targets_fulfillment_carriers: ${carriersRes.error.message}`);

  // Net sales per week from the daily rollup (revenue buckets only) so the
  // "% of net sales" figure uses the same number as the revenue sections.
  const bucketSet = new Set<string>(buckets);
  const netByWeek = new Map<string, number>();
  for (const r of daily) {
    if (!bucketSet.has(r.bucket)) continue;
    if (r.day_local < window.start || r.day_local > lastDay) continue;
    const w = weekStartOf(r.day_local);
    netByWeek.set(w, (netByWeek.get(w) ?? 0) + n(r.net_sales));
  }

  const rpcByWeek = new Map<string, (typeof weeklyRes.data)[number]>();
  for (const r of weeklyRes.data ?? []) rpcByWeek.set(String(r.week_start).slice(0, 10), r);

  const weeks: FulfillmentWeek[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) {
    const r = rpcByWeek.get(w);
    const facts: FulfillmentWeekFacts = {
      weekStart: w,
      orders: n(r?.orders),
      units: n(r?.units),
      netSales: netByWeek.get(w) ?? 0,
      shippingCharged: n(r?.shipping_charged),
      shippedOrders: n(r?.shipped_orders),
      shipments: n(r?.shipments),
      postage: n(r?.postage),
      avgHoursToShip: nn(r?.avg_hours_to_ship),
      p50HoursToShip: nn(r?.p50_hours_to_ship),
    };
    weeks.push(computeFulfillmentWeek(facts, rates, today));
  }
  const quarter = rollupFulfillment(weeks);

  const totalShipments = (carriersRes.data ?? []).reduce((s, r) => s + n(r.shipments), 0);
  const carriers: CarrierMix[] = (carriersRes.data ?? []).map((r) => {
    const shipments = n(r.shipments);
    const postage = n(r.postage);
    return {
      carrier: carrierLabel(String(r.carrier ?? "unknown")),
      method: String(r.shipping_method ?? "—"),
      shipments,
      share: totalShipments > 0 ? shipments / totalShipments : 0,
      postage,
      avgPostage: shipments > 0 ? postage / shipments : 0,
      avgWeightLb: nn(r.avg_weight_lb),
    };
  });

  const run = runRes.data;
  const sync: FulfillmentSync = {
    lastStartedAt: run?.started_at ?? null,
    lastFinishedAt: run?.finished_at ?? null,
    ok: run?.ok ?? null,
    complete: run?.complete ?? null,
    message: run?.message ?? null,
    dataAsOf: newestRes.data?.synced_at ?? null,
    shipmentsInWindow: countRes.count ?? 0,
  };

  const threeplFallbackByWeek = new Map<string, number | null>();
  for (const w of weeks) threeplFallbackByWeek.set(w.weekStart, threeplFallback(w));

  return {
    hasShipments: sync.shipmentsInWindow > 0,
    rates,
    weeks,
    quarter,
    carriers,
    sync,
    threeplFallbackByWeek,
  };
}
