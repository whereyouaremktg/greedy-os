import type { SupabaseClient } from "@supabase/supabase-js";

import { forecastAll } from "@/lib/inventory/forecast";
import { loadForecastInputs } from "@/lib/inventory/load";
import { summarizeForecastForContext } from "@/lib/inventory/narrate";

// Assembles a compact data context for the Glow OS analyst.
// Reads via the cookie-bound server client → respects RLS, so the user only
// sees what their session permits.
//
// Keep this summarized. Dumping raw rows past what's useful inflates tokens
// without helping the model reason.
export async function buildGlowContext(supabase: SupabaseClient) {
  const [
    vendors,
    products,
    purchaseOrders,
    poPayments,
    manufacturing,
    campaigns,
    qb,
    shopify,
    klaviyo,
    hubspot,
  ] = await Promise.all([
    supabase.from("vendors").select("id,name").limit(100),
    supabase
      .from("products")
      .select("id,name,sku,category,active")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("purchase_orders")
      .select(
        "id,po_number,status,total,order_date,expected_date,vendor_id,currency",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("po_payments")
      .select("id,purchase_order_id,label,amount,due_date,paid,paid_date")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("manufacturing_runs")
      .select(
        "id,vendor_id,purchase_order_id,product_id,product_name,variant,quantity,stage,expected_completion_date,expected_arrival_date,actual_completion_date,actual_arrival_date",
      )
      .limit(100),
    supabase
      .from("campaigns")
      .select("id,name,type,status,start_date,end_date")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("qb_financials")
      .select("*")
      .order("as_of_date", { ascending: false })
      .limit(30),
    supabase
      .from("shopify_metrics")
      .select("*")
      .order("as_of_date", { ascending: false })
      .limit(30),
    supabase
      .from("klaviyo_metrics")
      .select("*")
      .order("as_of_date", { ascending: false })
      .limit(30),
    supabase.from("hubspot_deals").select("*").limit(100),
  ]);

  // Compact, deterministic forecast summary (order_now / order_soon, plus any
  // demand_down). Wrapped so a forecast hiccup never breaks the analyst.
  let inventoryForecast: string;
  try {
    const inputs = await loadForecastInputs();
    const forecasts = forecastAll(inputs, { asOf: new Date() });
    const demandDown = forecasts
      .filter((f) => f.status === "demand_down")
      .map(
        (f) =>
          `- ${f.sku} (${f.productTitle}) [demand down]: run rate softening` +
          (f.yoyGrowth != null
            ? `, YoY ${(f.yoyGrowth * 100).toFixed(1)}%`
            : ""),
      );
    inventoryForecast = summarizeForecastForContext(forecasts);
    if (demandDown.length > 0) {
      inventoryForecast += `\nDemand softening:\n${demandDown.join("\n")}`;
    }
  } catch {
    inventoryForecast = "Inventory forecast: temporarily unavailable.";
  }

  return {
    generated_at: new Date().toISOString(),
    inventoryForecast,
    owned: {
      vendors: vendors.data ?? [],
      products: products.data ?? [],
      purchase_orders: purchaseOrders.data ?? [],
      po_payments: poPayments.data ?? [],
      manufacturing_runs: manufacturing.data ?? [],
      campaigns: campaigns.data ?? [],
    },
    mirrored: {
      qb_financials: qb.data ?? [],
      shopify_metrics: shopify.data ?? [],
      klaviyo_metrics: klaviyo.data ?? [],
      hubspot_deals: hubspot.data ?? [],
    },
  };
}
