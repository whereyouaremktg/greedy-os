import "server-only";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import { createServiceClient } from "@/lib/supabase/service";

const API_VERSION = "2026-01";
const PAGE_SIZE = 250;
const MAX_PAGES = 10;

// Tracked, active variants only — untracked items (e.g. package-protection
// apps) report bogus negative inventory and aren't real stock.
const VARIANTS_QUERY = /* GraphQL */ `
  query GlowOsInventory($cursor: String) {
    productVariants(first: ${PAGE_SIZE}, after: $cursor, query: "product_status:active") {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        title
        inventoryQuantity
        inventoryItem {
          tracked
        }
        product {
          title
        }
      }
    }
  }
`;

type VariantNode = {
  id: string;
  sku: string | null;
  title: string | null;
  inventoryQuantity: number | null;
  inventoryItem: { tracked: boolean } | null;
  product: { title: string } | null;
};

type VariantsData = {
  productVariants: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: VariantNode[];
  };
};

type InventoryRow = {
  variant_id: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  inventory_quantity: number;
  synced_at: string;
};

async function requestVariantsPage(
  client: ReturnType<typeof createAdminApiClient>,
  cursor: string | null,
): Promise<VariantsData["productVariants"] | null> {
  const res = await client.request<VariantsData>(VARIANTS_QUERY, {
    variables: { cursor },
  });
  if (res.errors) {
    throw new Error(
      `Shopify inventory query failed: ${res.errors.message ?? JSON.stringify(res.errors.graphQLErrors ?? res.errors)}`,
    );
  }
  return res.data?.productVariants ?? null;
}

export async function runShopifyInventoryPull(): Promise<{
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
  const rows: InventoryRow[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const pv = await requestVariantsPage(client, cursor);
    if (!pv) break;

    for (const node of pv.nodes) {
      if (!node.inventoryItem?.tracked) continue;
      const variantTitle =
        node.title && node.title !== "Default Title" ? node.title : null;
      rows.push({
        variant_id: node.id,
        sku: node.sku?.trim() || null,
        product_title: node.product?.title ?? "(unknown product)",
        variant_title: variantTitle,
        inventory_quantity: node.inventoryQuantity ?? 0,
        synced_at: syncedAt,
      });
    }

    if (!pv.pageInfo.hasNextPage) break;
    cursor = pv.pageInfo.endCursor;
    if (!cursor) break;
  }

  const supabase = createServiceClient();

  // Full replace — the table is a current-state snapshot of tracked variants.
  const { error: delError } = await supabase
    .from("shopify_inventory")
    .delete()
    .neq("variant_id", "");
  if (delError) {
    throw new Error(`shopify_inventory clear: ${delError.message}`);
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("shopify_inventory").insert(rows);
    if (error) throw new Error(`shopify_inventory insert: ${error.message}`);
  }

  return { ok: true, rows: rows.length };
}
