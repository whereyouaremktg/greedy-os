import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Read-time reconciliation of the ShipHero 3PL mirror against our OWNED intent
// tables. NON-DESTRUCTIVE: nothing here writes — it compares what the 3PL
// actually did vs. what we booked, and returns the deltas for the dashboard /
// analyst tool.
//
//   wholesale orders (shipped)  <->  purchase_orders (booked buyer POs)
//   inbound POs (received)      <->  ordered quantities (short/over receipts)

type UntypedDb = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: unknown; error: unknown }>;
  };
};

// Normalize a PO / order number so "0006066020", "6066020", and "PO 6066020"
// all collide. Retailers and our manual entry format these inconsistently.
function normalizePoNumber(raw: string | null | undefined): string {
  if (!raw) return "";
  const alnum = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return alnum.replace(/^0+/, "");
}

type WholesaleOrderRow = {
  order_number: string;
  order_date: string | null;
  account: string | null;
  total_price: number | null;
  total_quantity: number | null;
  fulfillment_status: string | null;
  classification: string;
};

type PurchaseOrderRow = {
  id: string;
  po_number: string | null;
  status: string | null;
  total: number | null;
  order_date: string | null;
};

export type WholesaleMatch = {
  account: string | null;
  orderNumber: string;
  shipheroStatus: string | null;
  shipheroValue: number | null;
  glowPoId: string;
  glowStatus: string | null;
  glowTotal: number | null;
};

export type WholesaleReconciliation = {
  // Shipped by the 3PL AND booked by us — the happy path.
  matched: WholesaleMatch[];
  // Shipped by the 3PL but we never booked a PO — likely revenue not yet
  // captured in Glow OS.
  shippedNotBooked: WholesaleOrderRow[];
  // Booked by us but the 3PL hasn't shipped (no matching wholesale order).
  bookedNotShipped: PurchaseOrderRow[];
  summary: {
    matchedCount: number;
    shippedNotBookedCount: number;
    bookedNotShippedCount: number;
    shippedNotBookedValue: number;
  };
};

async function selectAll<T>(
  db: UntypedDb,
  table: string,
  cols: string,
): Promise<T[]> {
  const res = await db.from(table).select(cols);
  if (res.error) {
    const msg =
      res.error && typeof res.error === "object" && "message" in res.error
        ? String((res.error as { message: unknown }).message)
        : String(res.error);
    throw new Error(`reconcile ${table}: ${msg}`);
  }
  return (res.data as T[] | null) ?? [];
}

export async function loadWholesaleReconciliation(
  db?: UntypedDb,
): Promise<WholesaleReconciliation> {
  const client = (db ??
    (createServiceClient() as unknown as UntypedDb)) as UntypedDb;

  const [wholesale, pos] = await Promise.all([
    selectAll<WholesaleOrderRow>(
      client,
      "shiphero_wholesale_orders",
      "order_number,order_date,account,total_price,total_quantity,fulfillment_status,classification",
    ),
    selectAll<PurchaseOrderRow>(
      client,
      "purchase_orders",
      "id,po_number,status,total,order_date",
    ),
  ]);

  const wholesaleOnly = wholesale.filter(
    (w) => w.classification === "wholesale",
  );

  const posByKey = new Map<string, PurchaseOrderRow>();
  for (const po of pos) {
    const key = normalizePoNumber(po.po_number);
    if (key) posByKey.set(key, po);
  }

  const matched: WholesaleMatch[] = [];
  const shippedNotBooked: WholesaleOrderRow[] = [];
  const matchedPoIds = new Set<string>();

  for (const w of wholesaleOnly) {
    const key = normalizePoNumber(w.order_number);
    const po = key ? posByKey.get(key) : undefined;
    if (po) {
      matchedPoIds.add(po.id);
      matched.push({
        account: w.account,
        orderNumber: w.order_number,
        shipheroStatus: w.fulfillment_status,
        shipheroValue: w.total_price,
        glowPoId: po.id,
        glowStatus: po.status,
        glowTotal: po.total,
      });
    } else {
      shippedNotBooked.push(w);
    }
  }

  const bookedNotShipped = pos.filter((po) => !matchedPoIds.has(po.id));

  return {
    matched,
    shippedNotBooked,
    bookedNotShipped,
    summary: {
      matchedCount: matched.length,
      shippedNotBookedCount: shippedNotBooked.length,
      bookedNotShippedCount: bookedNotShipped.length,
      shippedNotBookedValue: shippedNotBooked.reduce(
        (s, w) => s + (w.total_price ?? 0),
        0,
      ),
    },
  };
}

// Inbound receiving discrepancies straight from the 3PL's own PO records:
// where received != ordered (short or over receipts) or anything was rejected.
// Reliable without any shared key to manufacturing_runs, and independently useful.
type InboundPoRow = {
  po_number: string;
  po_date: string | null;
  vendor_name: string | null;
  fulfillment_status: string | null;
  total_quantity: number | null;
  total_received: number | null;
  total_rejected: number | null;
  date_closed: string | null;
  last_received_at: string | null;
  arrived_at: string | null;
};

export type InboundDiscrepancy = InboundPoRow & { variance: number };

const INBOUND_COLS =
  "po_number,po_date,vendor_name,fulfillment_status,total_quantity,total_received,total_rejected,date_closed,last_received_at,arrived_at";

export async function loadInboundDiscrepancies(
  db?: UntypedDb,
): Promise<InboundDiscrepancy[]> {
  const client = (db ??
    (createServiceClient() as unknown as UntypedDb)) as UntypedDb;
  const rows = await selectAll<InboundPoRow>(
    client,
    "shiphero_inbound_pos",
    INBOUND_COLS,
  );
  return rows
    .map((r) => ({
      ...r,
      variance: (r.total_received ?? 0) - (r.total_quantity ?? 0),
    }))
    .filter((r) => r.variance !== 0 || (r.total_rejected ?? 0) > 0)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}

// Full inbound feed (every PO), newest receiving first — the basis for an
// "inbound shipments" visibility view.
export async function loadInboundShipments(
  db?: UntypedDb,
): Promise<InboundPoRow[]> {
  const client = (db ??
    (createServiceClient() as unknown as UntypedDb)) as UntypedDb;
  const rows = await selectAll<InboundPoRow>(
    client,
    "shiphero_inbound_pos",
    INBOUND_COLS,
  );
  return rows.sort((a, b) => {
    const ax = a.last_received_at ?? a.date_closed ?? "";
    const bx = b.last_received_at ?? b.date_closed ?? "";
    return bx.localeCompare(ax);
  });
}
