import "server-only";
import { paginate, type ConnectionPage } from "@/lib/shiphero/client";
import { fullReplace, mirrorDb } from "@/lib/shiphero/mirror-db";

// ShipHero "Purchase Orders" (manufacturer -> warehouse inbound replenishment)
// -> shiphero_inbound_pos. We capture the full receiving timeline + freight
// detail for inbound visibility, and reconcile against our OWNED
// manufacturing_runs at read time (lib/shiphero/reconcile.ts). Glow's account
// does not use ShipHero's freight `inbound_shipments` module, so the PO is the
// authoritative inbound record.

// ShipHero per-operation complexity ~= outer_first * (1 + nested_first), capped
// at 4004. 30 * (1 + 20) = 630 — under cap, but few enough pages to finish fast.
const PAGE_SIZE = 30;
const LINES_PER_PO = 20;

// Scope: the ACTIVE inbound pipeline, not the full archive. Keep any PO that is
// not-yet-received (open/pending/partial — includes future shipments) OR was
// received recently. Fully-closed POs older than this drop off (ShipHero keeps
// the long-term history).
const RECENT_RECEIPT_DAYS = 90;
const TERMINAL_STATUSES = new Set(["closed", "canceled", "cancelled"]);

function isActiveOrRecent(
  status: string | null,
  dateClosed: string | null,
  cutoffMs: number,
): boolean {
  const s = (status ?? "").trim().toLowerCase();
  // Open / pending / partial / anything not terminal = in-flight or upcoming.
  if (!TERMINAL_STATUSES.has(s)) return true;
  // Terminal (received/canceled): keep only if it closed within the window.
  if (!dateClosed) return false;
  const t = Date.parse(dateClosed);
  return !Number.isNaN(t) && t >= cutoffMs;
}

type LineNode = {
  sku: string | null;
  product_name: string | null;
  vendor_sku: string | null;
  quantity: number | null;
  quantity_received: number | null;
  quantity_rejected: number | null;
  fulfillment_status: string | null;
  updated_at: string | null; // when this line's receipt was last recorded
};

type PONode = {
  po_number: string | null;
  po_date: string | null;
  created_at: string | null;
  arrived_at: string | null;
  date_closed: string | null;
  ship_date: string | null;
  fulfillment_status: string | null;
  subtotal: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  partner_order_number: string | null;
  po_note: string | null;
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
              created_at
              arrived_at
              date_closed
              ship_date
              fulfillment_status
              subtotal
              tracking_number
              shipping_carrier
              partner_order_number
              po_note
              vendor { name }
              warehouse { identifier }
              line_items(first: ${LINES_PER_PO}) {
                edges {
                  node {
                    sku
                    product_name
                    vendor_sku
                    quantity
                    quantity_received
                    quantity_rejected
                    fulfillment_status
                    updated_at
                  }
                }
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
  const cutoffMs = Date.now() - RECENT_RECEIPT_DAYS * 86_400_000;

  const nodes = await paginate<POData, PONode>({
    buildQuery,
    extract: (d) => d.purchase_orders?.data ?? null,
  });

  const rows = nodes
    .filter((n) => n.po_number)
    .filter((n) => isActiveOrRecent(n.fulfillment_status, n.date_closed, cutoffMs))
    .map((n) => {
      const lines = n.line_items.edges.map((e) => ({
        sku: e.node.sku,
        product_name: e.node.product_name,
        vendor_sku: e.node.vendor_sku,
        quantity: e.node.quantity ?? 0,
        quantity_received: e.node.quantity_received ?? 0,
        quantity_rejected: e.node.quantity_rejected ?? 0,
        fulfillment_status: e.node.fulfillment_status,
        updated_at: e.node.updated_at,
      }));
      // "When received into inventory" = date_closed. ShipHero has no immutable
      // per-line received_at — line.updated_at is bumped by ANY later edit, so
      // it's unreliable as a receipt date (we keep it in the JSON for reference
      // only). date_closed reflects receiving completion and is the honest signal.
      const lastReceivedAt = n.date_closed ?? null;

      return {
        po_number: n.po_number,
        po_date: n.po_date ? n.po_date.slice(0, 10) : null,
        po_created_at: n.created_at,
        arrived_at: n.arrived_at,
        date_closed: n.date_closed,
        ship_date: n.ship_date,
        last_received_at: lastReceivedAt,
        fulfillment_status: n.fulfillment_status,
        vendor_name: n.vendor?.name ?? null,
        warehouse: n.warehouse?.identifier ?? null,
        subtotal: toNum(n.subtotal),
        tracking_number: n.tracking_number,
        shipping_carrier: n.shipping_carrier,
        partner_order_number: n.partner_order_number,
        po_note: n.po_note,
        line_count: lines.length,
        total_quantity: lines.reduce((s, l) => s + l.quantity, 0),
        total_received: lines.reduce((s, l) => s + l.quantity_received, 0),
        total_rejected: lines.reduce((s, l) => s + l.quantity_rejected, 0),
        line_items: lines,
        synced_at: syncedAt,
      };
    });

  // Dedupe on po_number (PK) — ShipHero history can repeat a number.
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
