// Wholesale PO tracker read model. Rides on the existing purchase_orders
// table (vendors = retail partners). Q4 revenue counts a PO only once it is
// invoiced; everything else open is "booked, not invoiced".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import type { PoStatus } from "@/lib/purchase-orders/statuses";

type DB = SupabaseClient<Database>;

export type WholesalePo = {
  id: string;
  vendorId: string;
  partner: string;
  poNumber: string | null;
  total: number;
  invoicedAmount: number | null;
  orderDate: string | null;
  shipDate: string | null;
  cancelDate: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  paidDate: string | null;
  status: PoStatus;
  notes: string | null;
  /** How the Q4 total treats it. */
  bucket: "invoiced" | "booked" | "paid" | "excluded";
  /** Amount the Q4 total takes from this PO (invoiced amount or total). */
  countedAmount: number;
};

export type WholesaleSummary = {
  invoicedQ4: number;
  paidQ4: number;
  bookedNotInvoiced: number;
  pos: WholesalePo[];
  partners: Array<{ id: string; name: string }>;
  /** Partner names from the Q4 plan that have no PO yet. */
  partnersWithoutPos: string[];
};

const PLAN_PARTNERS = ["REVOLVE", "ANTHROPOLOGIE", "URBAN OUTFITTERS", "NORDSTROM", "TARGET"];
const DEAD_STATUSES = new Set<string>(["draft", "cancelled"]);

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getWholesaleSummary(
  db: DB,
  window: { start: string; end: string },
): Promise<WholesaleSummary> {
  const [{ data: poRows, error }, { data: vendorRows }] = await Promise.all([
    db
      .from("purchase_orders")
      .select(
        "id, vendor_id, po_number, total, invoiced_amount, order_date, ship_date, expected_date, invoice_date, invoice_number, paid_date, status, notes, vendors ( name )",
      )
      .order("order_date", { ascending: false, nullsFirst: false }),
    db.from("vendors").select("id, name").order("name"),
  ]);
  if (error) throw new Error(`purchase_orders: ${error.message}`);

  const inQ4 = (d: string | null) => d != null && d >= window.start && d <= window.end;

  const pos: WholesalePo[] = (poRows ?? [])
    .map((r) => {
      const vendor = r.vendors as { name: string } | { name: string }[] | null;
      const partner = Array.isArray(vendor) ? vendor[0]?.name ?? "—" : vendor?.name ?? "—";
      const total = num(r.total);
      const invoiced = r.invoiced_amount == null ? null : num(r.invoiced_amount);
      const status = r.status as PoStatus;
      const dead = DEAD_STATUSES.has(status);
      const anchor = r.ship_date ?? r.expected_date ?? r.order_date;

      let bucket: WholesalePo["bucket"] = "excluded";
      if (!dead && inQ4(r.invoice_date)) bucket = inQ4(r.paid_date) ? "paid" : "invoiced";
      else if (!dead && r.invoice_date == null && (anchor == null || anchor >= window.start) && (anchor == null || anchor <= window.end))
        bucket = "booked";

      return {
        id: r.id,
        vendorId: r.vendor_id,
        partner,
        poNumber: r.po_number,
        total,
        invoicedAmount: invoiced,
        orderDate: r.order_date,
        shipDate: r.ship_date,
        cancelDate: r.expected_date,
        invoiceDate: r.invoice_date,
        invoiceNumber: r.invoice_number,
        paidDate: r.paid_date,
        status,
        notes: r.notes,
        bucket,
        countedAmount: bucket === "invoiced" || bucket === "paid" ? (invoiced ?? total) : 0,
      };
    })
    // Show everything that matters for Q4: counted, booked, or still open.
    .filter((p) => p.bucket !== "excluded" || (!DEAD_STATUSES.has(p.status) && p.status !== "closed"));

  const invoicedQ4 = pos.reduce((s, p) => s + p.countedAmount, 0);
  const paidQ4 = pos.filter((p) => p.bucket === "paid").reduce((s, p) => s + p.countedAmount, 0);
  const bookedNotInvoiced = pos.filter((p) => p.bucket === "booked").reduce((s, p) => s + p.total, 0);

  const partners = (vendorRows ?? []).map((v) => ({ id: v.id, name: v.name }));
  const haveNames = new Set(pos.map((p) => p.partner.toLowerCase()));
  const partnersWithoutPos = PLAN_PARTNERS.filter((n) => !haveNames.has(n.toLowerCase()));

  return { invoicedQ4, paidQ4, bookedNotInvoiced, pos, partners, partnersWithoutPos };
}
