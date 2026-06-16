import "server-only";
import { paginate, type ConnectionPage } from "@/lib/shiphero/client";
import { fetchWarehouses } from "@/lib/shiphero/warehouses";
import { fullReplaceForTenant, mirrorDb } from "@/lib/shiphero/mirror-db";
import { resolveDefaultTenantId } from "@/lib/tenant/default-tenant";

// ShipHero warehouse_products -> retroship_inventory.
//
// retroship_inventory is the warehouse on-hand source of truth consumed by
// lib/inventory/load.ts (prefers available, falls back to on_hand). We snapshot
// every warehouse, keyed by the warehouse's legacy_id so the two AZ "Primary"
// warehouses don't collide on the (tenant_id, sku, warehouse) PK.

const PAGE_SIZE = 100;

type WPNode = {
  on_hand: number | null;
  available: number | null;
  allocated: number | null;
  product: { sku: string | null; name: string | null } | null;
};

type WPData = {
  warehouse_products: {
    data: ConnectionPage<WPNode>;
  };
};

function buildQuery(warehouseId: string) {
  return (cursor: string | null) => ({
    query: /* GraphQL */ `
      query GlowWarehouseProducts($wid: String!, $cursor: String) {
        warehouse_products(warehouse_id: $wid) {
          data(first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { on_hand available allocated product { sku name } } }
          }
        }
      }
    `,
    variables: { wid: warehouseId, cursor },
  });
}

export async function runShipHeroInventoryPull(): Promise<{
  ok: true;
  rows: number;
}> {
  const tenantId = await resolveDefaultTenantId();
  const warehouses = await fetchWarehouses();
  const syncedAt = new Date().toISOString();

  const rows: Record<string, unknown>[] = [];
  for (const wh of warehouses) {
    const nodes = await paginate<WPData, WPNode>({
      buildQuery: buildQuery(wh.id),
      extract: (d) => d.warehouse_products?.data ?? null,
    });
    for (const n of nodes) {
      const sku = n.product?.sku?.trim();
      if (!sku) continue;
      rows.push({
        tenant_id: tenantId,
        sku,
        warehouse: String(wh.legacyId),
        product_title: n.product?.name ?? null,
        on_hand: n.on_hand ?? 0,
        available: n.available,
        allocated: n.allocated,
        in_transit: null,
        synced_at: syncedAt,
      });
    }
  }

  const written = await fullReplaceForTenant(
    mirrorDb(),
    "retroship_inventory",
    tenantId,
    rows,
  );
  return { ok: true, rows: written };
}
