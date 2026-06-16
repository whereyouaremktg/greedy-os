import "server-only";
import { paginate, type ConnectionPage } from "@/lib/shiphero/client";
import { fullReplace, mirrorDb } from "@/lib/shiphero/mirror-db";

// ShipHero "Purchase Orders" (manufacturer -> warehouse inbound replenishment)
// -> shiphero_inbound_pos. These carry expected vs actually-received quantities,
// so they reconcile against our OWNED manufacturing_runs at read time
// (lib/shiphero/reconcile.ts). We never write into manufacturing_runs.

// ShipHero per-operation complexity ~= outer_first * (1 + nested_first), capped
// at 4004. 10 * (1 + 25) = 260, comfortably under.
const PAGE_SIZE = 10;
const LINES_PER_PO = 25;

type LineNode = {
  sku: string | null;
  quantity: number | null;
  quantity_received: number | null;
};

type PONode = {
  po_number: string | null;
  po_date: string | null;
  fulfillment_status: string | null;
  subtotal: string | null;
  vendor: { name: string | null } | null;
  warehouse: { identifier: string | null } | null;
  line_items: { edges: Array<{ node: LineNode }> };
};

type POData = {
  purchase_orders: { data: ConnectionPage<PONode> };
};

const buildQuery = (cursor: string | null) => ({
  query: /* GraphQL */ `
    query GlowInboundPOs($cursor: String) {
      purchase_orders {
        data(first: ${PAGE_SIZE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              po_number
              po_date
              fulfillment_status
              subtotal
              vendor { name }
              warehouse { identifier }
              line_items(first: ${LINES_PER_PO}) {
                edges { node { sku quantity quantity_received } }
              }
            }
          }
        }
      }
    }
  `,
  variables: { cursor },
});

function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function runShipHeroInboundPull(): Promise<{
  ok: true;
  rows: number;
}> {
  const syncedAt = new Date().toISOString();

  const nodes = await paginate<POData, PONode>({
    buildQuery,
    extract: (d) => d.purchase_orders?.data ?? null,
  });

  const rows = nodes
    .filter((n) => n.po_number)
    .map((n) => {
      const lines = n.line_items.edges.map((e) => ({
        sku: e.node.sku,
        quantity: e.node.quantity ?? 0,
        quantity_received: e.node.quantity_received ?? 0,
      }));
      return {
        po_number: n.po_number,
        po_date: n.po_date ? n.po_date.slice(0, 10) : null,
        fulfillment_status: n.fulfillment_status,
        vendor_name: n.vendor?.name ?? null,
        warehouse: n.warehouse?.identifier ?? null,
        subtotal: toNum(n.subtotal),
        line_count: lines.length,
        total_quantity: lines.reduce((s, l) => s + l.quantity, 0),
        total_received: lines.reduce((s, l) => s + l.quantity_received, 0),
        line_items: lines,
        synced_at: syncedAt,
      };
    });

  // Dedupe on po_number (composite PK) — ShipHero history can repeat a number.
  const byPo = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byPo.set(r.po_number as string, r);

  const written = await fullReplace(
    mirrorDb(),
    "shiphero_inbound_pos",
    "po_number",
    [...byPo.values()],
  );
  return { ok: true, rows: written };
}
