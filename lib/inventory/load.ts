import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ForecastInput,
  IncomingReceipt,
  MonthlySales,
} from "@/lib/inventory/forecast";

// Assembles ForecastInput[] for the growth-aware inventory forecast from the
// database, read through the cookie-bound server client so it respects RLS.
// Runs in app/server context and from the analyst tools. The forecast contract
// itself lives in "@/lib/inventory/forecast" and is not touched here.
//
// SKU universe = every SKU we have demand for (sku_sales_history). On-hand
// prefers Retroship (the WMS); we fall back to Shopify on-hand when Retroship
// hasn't been wired yet. Incoming supply comes from open manufacturing runs.

/** Final fallback lead time (days) when we have no run history to average. */
export const DEFAULT_LEAD_TIME_DAYS = 105;

/**
 * Manufacturing stages whose runs are still "incoming" (not yet on the shelf).
 * Anything in `received` has already landed and is reflected in on-hand, so it
 * must be excluded from incoming supply to avoid double-counting.
 */
const TERMINAL_STAGES = new Set<string>(["received"]);

const MS_PER_DAY = 86_400_000;

// These mirrored tables are not in the generated Database type yet, so we read
// them through an untyped view of the client and shape the rows explicitly.
type SalesHistoryRow = {
  sku: string;
  month: string;
  product_title: string | null;
  units_sold: number | null;
};

type RetroshipRow = {
  sku: string;
  on_hand: number | null;
  available: number | null;
};

type ShopifyInventoryRow = {
  sku: string | null;
  product_title: string | null;
  inventory_quantity: number | null;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string | null;
};

type ManufacturingRunRow = {
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  stage: string;
  expected_arrival_date: string | null;
  actual_arrival_date: string | null;
  created_at: string;
};

function dayDiff(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return (to - from) / MS_PER_DAY;
}

/** Normalize any date-ish string to a "YYYY-MM-01" month key. */
function toMonthKey(value: string): string | null {
  const t = Date.parse(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

// Untyped handle shape for tables absent from the generated Database type.
type UntypedDb = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: unknown; error: unknown }>;
  };
};

/**
 * Assemble ForecastInput[] from the database using the cookie-bound server
 * client (respects RLS). Use from app/server and analyst-tool contexts.
 */
export async function loadForecastInputs(): Promise<ForecastInput[]> {
  const supabase = await createClient();
  return loadForecastInputsFromDb(supabase as unknown as UntypedDb);
}

/**
 * Service-role variant for crons/pullers that have no request cookies. Reads
 * the exact same tables via the service client (bypasses RLS). Additive — the
 * RLS-bound loadForecastInputs() above is unchanged.
 */
export async function loadForecastInputsService(): Promise<ForecastInput[]> {
  const supabase = createServiceClient();
  return loadForecastInputsFromDb(supabase as unknown as UntypedDb);
}

async function loadForecastInputsFromDb(
  db: UntypedDb,
): Promise<ForecastInput[]> {
  const [
    salesRes,
    retroshipRes,
    shopifyRes,
    productsRes,
    runsRes,
  ] = await Promise.all([
    db.from("sku_sales_history").select("sku,month,product_title,units_sold"),
    db.from("retroship_inventory").select("sku,on_hand,available"),
    db
      .from("shopify_inventory")
      .select("sku,product_title,inventory_quantity"),
    db.from("products").select("id,sku,name"),
    db
      .from("manufacturing_runs")
      .select(
        "product_id,product_name,quantity,stage,expected_arrival_date,actual_arrival_date,created_at",
      ),
  ]);

  const salesRows = (salesRes.data as SalesHistoryRow[] | null) ?? [];
  const retroshipRows = (retroshipRes.data as RetroshipRow[] | null) ?? [];
  const shopifyRows = (shopifyRes.data as ShopifyInventoryRow[] | null) ?? [];
  const productRows = (productsRes.data as ProductRow[] | null) ?? [];
  const runRows = (runsRes.data as ManufacturingRunRow[] | null) ?? [];

  // --- SKU universe + history + product titles, from sku_sales_history. ------
  const historyBySku = new Map<string, MonthlySales[]>();
  const titleFromSales = new Map<string, string>();
  for (const row of salesRows) {
    if (!row?.sku) continue;
    const month = toMonthKey(row.month);
    if (!month) continue;
    const arr = historyBySku.get(row.sku) ?? [];
    arr.push({ month, units: row.units_sold ?? 0 });
    historyBySku.set(row.sku, arr);
    if (!titleFromSales.has(row.sku) && row.product_title) {
      titleFromSales.set(row.sku, row.product_title);
    }
  }
  for (const arr of historyBySku.values()) {
    arr.sort((a, b) => a.month.localeCompare(b.month));
  }

  // --- On-hand: prefer Retroship (available → on_hand), else Shopify. --------
  const retroshipOnHand = new Map<string, number>();
  let hasRetroship = false;
  for (const row of retroshipRows) {
    if (!row?.sku) continue;
    hasRetroship = true;
    const qty = row.available ?? row.on_hand ?? 0;
    retroshipOnHand.set(row.sku, (retroshipOnHand.get(row.sku) ?? 0) + qty);
  }

  const shopifyOnHand = new Map<string, number>();
  const titleFromShopify = new Map<string, string>();
  for (const row of shopifyRows) {
    if (!row?.sku) continue;
    shopifyOnHand.set(
      row.sku,
      (shopifyOnHand.get(row.sku) ?? 0) + (row.inventory_quantity ?? 0),
    );
    if (!titleFromShopify.has(row.sku) && row.product_title) {
      titleFromShopify.set(row.sku, row.product_title);
    }
  }

  function onHandForSku(sku: string): number {
    if (hasRetroship && retroshipOnHand.has(sku)) {
      return retroshipOnHand.get(sku) ?? 0;
    }
    return shopifyOnHand.get(sku) ?? 0;
  }

  // --- product_id → sku and name → sku maps for mapping runs to SKUs. -------
  const skuByProductId = new Map<string, string>();
  const titleFromProductSku = new Map<string, string>();
  const skuByProductName = new Map<string, string>();
  for (const p of productRows) {
    if (!p?.id) continue;
    if (p.sku) {
      skuByProductId.set(p.id, p.sku);
      if (p.name && !titleFromProductSku.has(p.sku)) {
        titleFromProductSku.set(p.sku, p.name);
      }
    }
    if (p.name && p.sku) {
      const key = p.name.trim().toLowerCase();
      if (!skuByProductName.has(key)) skuByProductName.set(key, p.sku);
    }
  }

  function skuForRun(run: ManufacturingRunRow): string | null {
    if (run.product_id) {
      const mapped = skuByProductId.get(run.product_id);
      if (mapped) return mapped;
    }
    if (run.product_name) {
      const byName = skuByProductName.get(run.product_name.trim().toLowerCase());
      if (byName) return byName;
    }
    return null;
  }

  // --- Lead time: avg(actual_arrival_date − created_at) over received runs. --
  const leadTimeSamplesBySku = new Map<string, number[]>();
  const globalLeadTimeSamples: number[] = [];
  for (const run of runRows) {
    if (!run?.actual_arrival_date) continue;
    const days = dayDiff(run.created_at, run.actual_arrival_date);
    if (days === null || days <= 0) continue;
    globalLeadTimeSamples.push(days);
    const sku = skuForRun(run);
    if (!sku) continue;
    const arr = leadTimeSamplesBySku.get(sku) ?? [];
    arr.push(days);
    leadTimeSamplesBySku.set(sku, arr);
  }
  const avg = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const globalLeadTime = avg(globalLeadTimeSamples);

  function leadTimeForSku(sku: string): number {
    const perSku = avg(leadTimeSamplesBySku.get(sku) ?? []);
    return Math.round(perSku ?? globalLeadTime ?? DEFAULT_LEAD_TIME_DAYS);
  }

  // --- Incoming: open runs (not received) with a future arrival date. -------
  const nowMs = Date.now();
  const incomingBySku = new Map<string, IncomingReceipt[]>();
  for (const run of runRows) {
    if (!run || TERMINAL_STAGES.has(run.stage)) continue;
    const arrival = run.expected_arrival_date;
    if (!arrival) continue;
    const arrivalMs = Date.parse(`${arrival.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(arrivalMs) || arrivalMs <= nowMs) continue;
    const sku = skuForRun(run);
    if (!sku) continue;
    const arr = incomingBySku.get(sku) ?? [];
    arr.push({ arrivalDate: arrival.slice(0, 10), qty: run.quantity ?? 0 });
    incomingBySku.set(sku, arr);
  }

  // --- Assemble one ForecastInput per SKU in the demand universe. ------------
  const inputs: ForecastInput[] = [];
  for (const [sku, history] of historyBySku) {
    const productTitle =
      titleFromSales.get(sku) ??
      titleFromShopify.get(sku) ??
      titleFromProductSku.get(sku) ??
      sku;
    inputs.push({
      sku,
      productTitle,
      onHand: onHandForSku(sku),
      incoming: incomingBySku.get(sku) ?? [],
      history,
      leadTimeDays: leadTimeForSku(sku),
    });
  }

  return inputs;
}
