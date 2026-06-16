import "server-only";
import { paginate, type ConnectionPage } from "@/lib/shiphero/client";
import { fullReplace, mirrorDb } from "@/lib/shiphero/mirror-db";

// ShipHero "Manual Order" channel -> shiphero_wholesale_orders.
//
// This channel is a MIXED BAG: real wholesale (Anthropologie, Urban Outfitters,
// SalonCentric, ...) alongside PR/influencer gifting and admin/replacement
// orders. We pull all of it and CLASSIFY, so the read layer can isolate true
// wholesale and reconcile it against purchase_orders (buyer POs) by the
// retailer's PO number == ShipHero order_number.

const SHOP_NAME = "Manual Order";
// Per-operation complexity ~= outer_first * (1 + nested_first), capped at 4004.
const PAGE_SIZE = 20;
const LINES_PER_ORDER = 10;
const LOOKBACK_DAYS = 540; // ~18 months
const WHOLESALE_QTY_FLOOR = 12; // bulk threshold when price is $0 (no-charge POs)

export type WholesaleClassification =
  | "wholesale"
  | "gifting"
  | "admin"
  | "unknown";

type LineNode = {
  sku: string | null;
  quantity: number | null;
  product_name: string | null;
};

type OrderNode = {
  order_number: string | null;
  order_date: string | null;
  fulfillment_status: string | null;
  total_price: string | null;
  shipping_address: {
    company: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  line_items: { edges: Array<{ node: LineNode }> };
};

type OrdersData = {
  orders: { data: ConnectionPage<OrderNode> };
};

function buildQuery(fromDate: string) {
  return (cursor: string | null) => ({
    query: /* GraphQL */ `
      query GlowWholesaleOrders($shop: String!, $from: ISODateTime!, $cursor: String) {
        orders(shop_name: $shop, order_date_from: $from) {
          data(first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                order_number
                order_date
                fulfillment_status
                total_price
                shipping_address { company first_name last_name }
                line_items(first: ${LINES_PER_ORDER}) {
                  edges { node { sku quantity product_name } }
                }
              }
            }
          }
        }
      }
    `,
    variables: { shop: SHOP_NAME, from: fromDate, cursor },
  });
}

function classify(
  company: string,
  price: number,
  totalQty: number,
  orderNumber: string,
): WholesaleClassification {
  if (company && (price > 0 || totalQty >= WHOLESALE_QTY_FLOOR)) {
    return "wholesale";
  }
  if (/^(admin|x-)/i.test(orderNumber)) return "admin";
  if (!company && price === 0 && totalQty <= 2) return "gifting";
  if (company) return "wholesale"; // named retailer, low value — still B2B
  return "unknown";
}

export async function runShipHeroWholesalePull(): Promise<{
  ok: true;
  rows: number;
  wholesale: number;
}> {
  const syncedAt = new Date().toISOString();
  const fromDate = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const nodes = await paginate<OrdersData, OrderNode>({
    buildQuery: buildQuery(fromDate),
    extract: (d) => d.orders?.data ?? null,
  });

  const byOrder = new Map<string, Record<string, unknown>>();
  let wholesaleCount = 0;

  for (const n of nodes) {
    const orderNumber = n.order_number?.trim();
    if (!orderNumber) continue;

    const company = (n.shipping_address?.company ?? "").trim();
    const price = Number(n.total_price ?? 0) || 0;
    const lines = n.line_items.edges.map((e) => ({
      sku: e.node.sku,
      quantity: e.node.quantity ?? 0,
      product_name: e.node.product_name,
    }));
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    const classification = classify(company, price, totalQty, orderNumber);
    if (classification === "wholesale") wholesaleCount++;

    const contact = [
      n.shipping_address?.first_name,
      n.shipping_address?.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    byOrder.set(orderNumber, {
      order_number: orderNumber,
      order_date: n.order_date ? n.order_date.slice(0, 10) : null,
      account: company || null,
      contact_name: contact || null,
      fulfillment_status: n.fulfillment_status,
      total_price: price,
      total_quantity: totalQty,
      classification,
      line_items: lines,
      synced_at: syncedAt,
    });
  }

  const rows = [...byOrder.values()];
  const written = await fullReplace(
    mirrorDb(),
    "shiphero_wholesale_orders",
    "order_number",
    rows,
  );
  return { ok: true, rows: written, wholesale: wholesaleCount };
}
