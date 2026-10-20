// Launch tracker read model: manual drops + sell-through from synced Shopify
// order lines (paid revenue buckets only).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import type { Bucket } from "@/lib/targets/classify";
import { addDays, daysBetween } from "@/lib/targets/dates";

type DB = SupabaseClient<Database>;

export type LaunchDrop = {
  id: string;
  name: string;
  dropDate: string;
  plannedUnits: number | null;
  skus: string[];
  notes: string | null;
  unitsSold: number;
  revenue: number;
  /** units / planned, 0..1+ (null without a plan). */
  sellThrough: number | null;
  /** Calendar days from drop to the day cumulative units reached plan; null if not yet. */
  daysToSellOut: number | null;
  daysSinceDrop: number;
  /** Daily cumulative units from the drop date (for a small sparkline). */
  cumulative: Array<{ day: string; units: number }>;
  bySku: Array<{ sku: string; units: number; revenue: number }>;
  isUpcoming: boolean;
};

export type LaunchesData = {
  drops: LaunchDrop[];
  knownSkus: Array<{ sku: string; name: string }>;
};

function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function getLaunches(
  db: DB,
  opts: { today: string; windowEnd: string; revenueBuckets: Bucket[] },
): Promise<LaunchesData> {
  const [{ data: dropRows, error }, { data: productRows }] = await Promise.all([
    db.from("launch_drops").select("*").order("drop_date", { ascending: true }),
    db.from("products").select("sku, name").not("sku", "is", null).order("sku"),
  ]);
  if (error) throw new Error(`launch_drops: ${error.message}`);

  const drops: LaunchDrop[] = [];
  for (const d of dropRows ?? []) {
    const skus = (d.skus ?? []).map((s) => s.trim()).filter(Boolean);
    const isUpcoming = d.drop_date > opts.today;
    const end = opts.today < opts.windowEnd ? opts.today : opts.windowEnd;
    let rows: Array<{ day_local: string; sku: string; units: number; revenue: number }> = [];
    if (!isUpcoming && skus.length > 0) {
      const res = await db.rpc("targets_sku_daily", {
        p_start: d.drop_date,
        p_end: end,
        p_skus: skus,
        p_buckets: opts.revenueBuckets,
      });
      if (res.error) throw new Error(`targets_sku_daily: ${res.error.message}`);
      rows = (res.data ?? []).map((r) => ({
        day_local: String(r.day_local),
        sku: String(r.sku),
        units: n(r.units),
        revenue: n(r.revenue),
      }));
    }

    const bySkuMap = new Map<string, { units: number; revenue: number }>();
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const s = bySkuMap.get(r.sku) ?? { units: 0, revenue: 0 };
      s.units += r.units;
      s.revenue += r.revenue;
      bySkuMap.set(r.sku, s);
      byDay.set(r.day_local, (byDay.get(r.day_local) ?? 0) + r.units);
    }
    const unitsSold = rows.reduce((s, r) => s + r.units, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);

    const cumulative: LaunchDrop["cumulative"] = [];
    let cum = 0;
    let daysToSellOut: number | null = null;
    if (!isUpcoming) {
      for (let day = d.drop_date; day <= end; day = addDays(day, 1)) {
        cum += byDay.get(day) ?? 0;
        cumulative.push({ day, units: cum });
        if (daysToSellOut == null && d.planned_units != null && d.planned_units > 0 && cum >= d.planned_units) {
          daysToSellOut = daysBetween(d.drop_date, day) + 1;
        }
      }
    }

    drops.push({
      id: d.id,
      name: d.name,
      dropDate: d.drop_date,
      plannedUnits: d.planned_units,
      skus,
      notes: d.notes,
      unitsSold,
      revenue,
      sellThrough: d.planned_units != null && d.planned_units > 0 ? unitsSold / d.planned_units : null,
      daysToSellOut,
      daysSinceDrop: isUpcoming ? 0 : daysBetween(d.drop_date, end) + 1,
      cumulative,
      bySku: skus.map((sku) => ({ sku, ...(bySkuMap.get(sku) ?? { units: 0, revenue: 0 }) })),
      isUpcoming,
    });
  }

  return {
    drops,
    knownSkus: (productRows ?? [])
      .filter((p): p is { sku: string; name: string } => Boolean(p.sku))
      .map((p) => ({ sku: p.sku, name: p.name })),
  };
}
