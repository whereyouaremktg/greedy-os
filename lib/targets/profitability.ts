// Server read model for the profitability panel: weekly facts from the
// synced Shopify orders + SKU costs (RPC) + manual weekly inputs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { REVENUE_BUCKETS, type Bucket } from "@/lib/targets/classify";
import { addDays } from "@/lib/targets/dates";
import {
  computeWeek,
  rollupQuarter,
  weekStartOf,
  type ProfitThresholds,
  type QuarterProfit,
  type WeekFacts,
  type WeekInputs,
  type WeekProfit,
} from "@/lib/targets/profit";

type DB = SupabaseClient<Database>;

export type DailySalesRow = {
  day_local: string;
  bucket: string;
  orders: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  units: number;
};

export type ProfitabilityData = {
  weeks: WeekProfit[];
  quarter: QuarterProfit;
  inputs: Record<string, WeekInputs>;
  /** Products with a unit cost on file / products with a SKU. */
  skuCostCoverage: { withCost: number; total: number };
  products: Array<{ sku: string; name: string; unitCost: number | null }>;
};

function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getProfitability(
  db: DB,
  opts: {
    daily: DailySalesRow[];
    window: { start: string; end: string };
    today: string;
    revenueBuckets: Bucket[];
    thresholds: ProfitThresholds;
    /** Weekly fulfillment estimate (postage + rate card) keyed by week start; the 3PL fallback. */
    threeplFallbackByWeek?: Map<string, number | null>;
  },
): Promise<ProfitabilityData> {
  const { daily, window, today, thresholds } = opts;
  const buckets = opts.revenueBuckets.length > 0 ? opts.revenueBuckets : [...REVENUE_BUCKETS];
  const lastDay = today > window.end ? window.end : today;
  const firstWeek = weekStartOf(window.start);
  const lastWeek = weekStartOf(lastDay);

  const [cogsRes, inputsRes, skuRes] = await Promise.all([
    db.rpc("targets_weekly_cogs", { p_start: window.start, p_end: window.end, p_buckets: buckets }),
    db
      .from("targets_weekly_inputs")
      .select("*")
      .gte("week_start", firstWeek)
      .lte("week_start", window.end),
    db
      .from("products")
      .select("sku, name, unit_cost_usd")
      .not("sku", "is", null)
      .order("sku"),
  ]);
  if (cogsRes.error) throw new Error(`targets_weekly_cogs: ${cogsRes.error.message}`);

  const cogsByWeek = new Map<string, { units: number; unitsWithCost: number; cogs: number }>();
  for (const r of cogsRes.data ?? []) {
    cogsByWeek.set(String(r.week_start).slice(0, 10), {
      units: n(r.units),
      unitsWithCost: n(r.units_with_cost),
      cogs: n(r.cogs),
    });
  }

  const inputs: Record<string, WeekInputs> = {};
  for (const r of inputsRes.data ?? []) {
    inputs[r.week_start] = {
      weekStart: r.week_start,
      adSpendMeta: r.ad_spend_meta,
      adSpendTiktok: r.ad_spend_tiktok,
      adSpendGoogle: r.ad_spend_google,
      adSpendOther: r.ad_spend_other,
      threeplCost: r.threepl_cost,
      otherOpex: r.other_opex,
      cogsOverride: r.cogs_override,
      notes: r.notes,
    };
  }

  // Facts per week from the daily rollup (revenue buckets only).
  const bucketSet = new Set<string>(buckets);
  const factsByWeek = new Map<string, WeekFacts>();
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) {
    const c = cogsByWeek.get(w);
    factsByWeek.set(w, {
      weekStart: w,
      netSales: 0,
      grossSales: 0,
      discounts: 0,
      orders: 0,
      units: c?.units ?? 0,
      unitsWithCost: c?.unitsWithCost ?? 0,
      cogsEstimate: c?.cogs ?? 0,
    });
  }
  for (const r of daily) {
    if (!bucketSet.has(r.bucket)) continue;
    if (r.day_local < window.start || r.day_local > lastDay) continue;
    const f = factsByWeek.get(weekStartOf(r.day_local));
    if (!f) continue;
    f.netSales += n(r.net_sales);
    f.grossSales += n(r.gross_sales);
    f.discounts += n(r.discounts);
    f.orders += n(r.orders);
  }

  const weeks = [...factsByWeek.values()].map((f) =>
    computeWeek(f, inputs[f.weekStart] ?? null, thresholds, today, {
      threepl: opts.threeplFallbackByWeek?.get(f.weekStart) ?? null,
    }),
  );
  const quarter = rollupQuarter(weeks);

  const products = skuRes.data ?? [];
  const skuCostCoverage = {
    withCost: products.filter((p) => p.unit_cost_usd != null).length,
    total: products.length,
  };

  const productList = products
    .filter((p): p is { sku: string; name: string; unit_cost_usd: number | null } => Boolean(p.sku))
    .map((p) => ({ sku: p.sku, name: p.name, unitCost: p.unit_cost_usd }));

  return { weeks, quarter, inputs, skuCostCoverage, products: productList };
}
