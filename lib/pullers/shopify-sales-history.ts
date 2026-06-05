import "server-only";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import { createServiceClient } from "@/lib/supabase/service";

const API_VERSION = "2026-01";
// Long lookback: 24 months of monthly history powers YoY growth + seasonality.
const LOOKBACK_MONTHS = 24;

// ShopifyQL "sales" dataset, grouped by SKU and month.
//
// MEASURE/DIMENSION NAMES — MUST BE VERIFIED AGAINST THE LIVE STORE:
//   - measure  `net_items_sold`        → unit quantity sold net of returns.
//       Chosen over `ordered_item_quantity` (gross, pre-returns) because the
//       forecast wants realized demand. If the live `sales` dataset rejects
//       `net_items_sold`, fall back to `ordered_item_quantity`.
//   - measure  `net_sales`             → revenue net of discounts/returns.
//   - dimension `product_variant_sku`  → the SKU we key history on.
//   - dimension `month`                → calendar-month grain.
// ShopifyQL returns row values keyed by the SHOW / GROUP BY names, so the row
// keys below ("net_items_sold", "net_sales", "product_variant_sku", "month")
// must match these tokens exactly.
const SALES_HISTORY_QUERY = /* GraphQL */ `
  query GlowOsSalesHistory($q: String!) {
    shopifyqlQuery(query: $q) {
      parseErrors
      tableData {
        columns {
          name
        }
        rows
      }
    }
  }
`;

type SalesHistoryRow = {
  sku: string;
  month: string; // "YYYY-MM-01"
  product_title: string | null;
  units_sold: number;
  net_sales: number | null;
  synced_at: string;
};

// Normalize a ShopifyQL month value to the first of the month, "YYYY-MM-01".
// Accepts "YYYY-MM", "YYYY-MM-DD", or ISO timestamps.
function normalizeMonth(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

export async function runShopifySalesHistoryPull(): Promise<{
  ok: true;
  rows: number;
}> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  if (!domain) {
    throw new Error(
      "Shopify credentials missing: SHOPIFY_STORE_DOMAIN is not set",
    );
  }

  const accessToken = await resolveShopifyAccessToken(domain);

  const client = createAdminApiClient({
    storeDomain: domain,
    apiVersion: API_VERSION,
    accessToken,
    retries: 2,
  });

  const syncedAt = new Date().toISOString();
  const rows: SalesHistoryRow[] = [];

  try {
    const q =
      `FROM sales ` +
      `SHOW net_items_sold, net_sales ` +
      `GROUP BY product_variant_sku, month ` +
      `SINCE -${LOOKBACK_MONTHS}m UNTIL today ` +
      `ORDER BY month`;

    const res = await client.request<{
      shopifyqlQuery: {
        parseErrors: string[] | null;
        tableData: {
          columns: { name: string }[];
          rows: Array<Record<string, string | number>>;
        } | null;
      };
    }>(SALES_HISTORY_QUERY, { variables: { q } });

    const data = res.data?.shopifyqlQuery;
    if (res.errors || data?.parseErrors?.length || !data?.tableData) {
      // Defensive like fetchSessionsByDay: a ShopifyQL hiccup yields no rows
      // rather than throwing mid-pull.
      return { ok: true, rows: 0 };
    }

    for (const row of data.tableData.rows) {
      const sku = String(row.product_variant_sku ?? "").trim();
      if (!sku) continue; // skip rows with empty sku

      const month = normalizeMonth(row.month);
      if (!month) continue;

      const units = Number(row.net_items_sold ?? 0);
      const netSalesRaw = Number(row.net_sales ?? NaN);

      rows.push({
        sku,
        month,
        product_title: null,
        units_sold: Number.isFinite(units) ? Math.round(units) : 0,
        net_sales: Number.isFinite(netSalesRaw)
          ? Math.round(netSalesRaw * 100) / 100
          : null,
        synced_at: syncedAt,
      });
    }
  } catch {
    // Tolerate transient ShopifyQL failures — surface zero rows, don't crash.
    return { ok: true, rows: 0 };
  }

  if (rows.length === 0) return { ok: true, rows: 0 };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("sku_sales_history")
    .upsert(rows, { onConflict: "sku,month" });

  if (error) throw new Error(`sku_sales_history upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
