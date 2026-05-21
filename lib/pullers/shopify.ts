import { createServiceClient } from "@/lib/supabase/service";
import { lastNDates, seedInt, seedNumber } from "./_mock";

const TOP_SKUS = [
  { sku: "GLOW-CL-01", name: "Glow Daily Cleanser" },
  { sku: "GLOW-SR-02", name: "Brightening Serum" },
  { sku: "GLOW-MO-03", name: "Hydrating Moisturizer" },
  { sku: "GLOW-MA-04", name: "Clay Mask" },
  { sku: "GLOW-OL-05", name: "Rosehip Facial Oil" },
];

// STUB: deterministic mock Shopify DTC metrics for the last 30 days.
// Replace with real Admin API (orders.list, products.list) when wired.
export async function runShopifyPull() {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const rows = lastNDates(30).map((as_of_date) => {
    const k = (suffix: string) => `shopify:${as_of_date}:${suffix}`;
    const revenue = seedNumber(k("rev"), 6000, 15000);
    const order_count = seedInt(k("orders"), 60, 180);
    const aov = Math.round((revenue / order_count) * 100) / 100;

    const top_products = TOP_SKUS.map((p, i) => ({
      sku: p.sku,
      name: p.name,
      revenue: seedNumber(k(`p${i}rev`), 600, 3000),
      units: seedInt(k(`p${i}units`), 8, 80),
    }));

    return { as_of_date, revenue, order_count, aov, top_products, synced_at: now };
  });

  const { error } = await supabase
    .from("shopify_metrics")
    .upsert(rows, { onConflict: "as_of_date" });

  if (error) throw new Error(`shopify_metrics upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
