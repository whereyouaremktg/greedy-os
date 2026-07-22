import type { SupabaseClient } from "@supabase/supabase-js";

import { findOrCreateVendorByName as findOrCreateVendorByNameLookup } from "@/lib/vendors/lookup";
import type { CreatePurchaseOrderInput } from "@/lib/purchase-orders/schema";
import { latestCancelDate } from "@/lib/purchase-orders/schema";
import type { PoStatus } from "@/lib/purchase-orders/statuses";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type PoCoreError = { code: string; message: string };

export type PoCoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: PoCoreError };

function dbError(
  err: { code?: string; message?: string } | null,
  fallback: string,
): PoCoreError {
  return {
    code: err?.code ?? "DB_ERROR",
    message: err?.message ?? fallback,
  };
}

export async function findOrCreateVendorByName(
  supabase: Client,
  actorUserId: string | null,
  name: string,
): Promise<
  PoCoreResult<{ id: string; name: string; created: boolean }>
> {
  return findOrCreateVendorByNameLookup(supabase, actorUserId, name);
}

export type PurchaseOrderSummary = {
  id: string;
  po_number: string | null;
  vendor_name: string;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  total: number;
  line_item_count: number;
  total_units: number;
};

export async function createPurchaseOrderCore(
  supabase: Client,
  actorUserId: string | null,
  input: CreatePurchaseOrderInput,
): Promise<PoCoreResult<PurchaseOrderSummary>> {
  let vendorId = input.vendor_id ?? null;

  if (!vendorId) {
    if (!input.vendor_name?.trim()) {
      return {
        ok: false,
        error: {
          code: "INVALID",
          message: "Provide vendor_id or vendor_name",
        },
      };
    }

    const vendor = await findOrCreateVendorByName(
      supabase,
      actorUserId,
      input.vendor_name,
    );
    if (!vendor.ok) return vendor;
    vendorId = vendor.data.id;
  }

  const expectedDate =
    input.expected_date ??
    latestCancelDate(input.line_items) ??
    null;

  const subtotal =
    input.subtotal ??
    input.line_items.reduce(
      (sum, item) => sum + item.quantity * item.unit_cost,
      0,
    );

  const poRow: Database["public"]["Tables"]["purchase_orders"]["Insert"] = {
    vendor_id: vendorId,
    po_number: input.po_number?.trim() || null,
    status: input.status,
    currency: input.currency ?? "USD",
    subtotal,
    total: input.total,
    order_date: input.order_date ?? null,
    expected_date: expectedDate,
    notes: input.notes?.trim() || null,
    ...(actorUserId ? { created_by: actorUserId } : {}),
  };

  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .insert(poRow)
    .select(
      `id, po_number, status, order_date, expected_date, total,
       vendors!inner ( name )`,
    )
    .single();

  if (poError || !po) {
    return {
      ok: false,
      error: dbError(poError, "Failed to create purchase order"),
    };
  }

  const lineRows: Database["public"]["Tables"]["po_line_items"]["Insert"][] =
    input.line_items.map((item) => ({
      purchase_order_id: po.id,
      product_name: item.product_name.trim(),
      sku: item.sku?.trim() || null,
      style_number: item.style_number?.trim() || null,
      color: item.color?.trim() || null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      retail_price: item.retail_price ?? null,
      cancel_date: item.cancel_date ?? null,
    }));

  const { error: linesError } = await supabase
    .from("po_line_items")
    .insert(lineRows);

  if (linesError) {
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    return {
      ok: false,
      error: dbError(linesError, "Failed to create PO line items"),
    };
  }

  const totalUnits = input.line_items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return {
    ok: true,
    data: {
      id: po.id,
      po_number: po.po_number,
      vendor_name: (po.vendors as { name: string }).name,
      status: po.status,
      order_date: po.order_date,
      expected_date: po.expected_date,
      total: po.total,
      line_item_count: input.line_items.length,
      total_units: totalUnits,
    },
  };
}

export async function updatePoStatusCore(
  supabase: Client,
  id: string,
  status: PoStatus,
): Promise<PoCoreResult<{ id: string; status: PoStatus }>> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return { ok: false, error: dbError(error, "Failed to update PO status") };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }

  return { ok: true, data: { id: data.id, status: data.status } };
}

export type UpdatePoShipmentInput = {
  ship_date?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
};

export async function updatePoShipmentCore(
  supabase: Client,
  id: string,
  input: UpdatePoShipmentInput,
): Promise<
  PoCoreResult<{
    id: string;
    ship_date: string | null;
    tracking_number: string | null;
    carrier: string | null;
  }>
> {
  const patch: Database["public"]["Tables"]["purchase_orders"]["Update"] = {};

  if ("ship_date" in input) patch.ship_date = input.ship_date ?? null;
  if ("tracking_number" in input) {
    patch.tracking_number = input.tracking_number?.trim() || null;
  }
  if ("carrier" in input) patch.carrier = input.carrier?.trim() || null;

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", id)
    .select("id, ship_date, tracking_number, carrier")
    .maybeSingle();

  if (error) {
    return { ok: false, error: dbError(error, "Failed to update shipment") };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }

  return { ok: true, data };
}

export type UpdatePoDetailsInput = {
  po_number?: string | null;
  status?: PoStatus;
  order_date?: string | null;
  expected_date?: string | null;
};

export async function updatePoDetailsCore(
  supabase: Client,
  id: string,
  input: UpdatePoDetailsInput,
): Promise<PoCoreResult<{ id: string }>> {
  const patch: Database["public"]["Tables"]["purchase_orders"]["Update"] = {};
  if ("po_number" in input) patch.po_number = input.po_number?.trim() || null;
  if ("status" in input && input.status) patch.status = input.status;
  if ("order_date" in input) patch.order_date = input.order_date || null;
  if ("expected_date" in input) patch.expected_date = input.expected_date || null;

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: dbError(error, "Failed to update details") };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }
  return { ok: true, data };
}

export type UpdatePoLabelsInput = {
  labels_ordered?: boolean;
  labels_cost?: number | null;
  labels_note?: string | null;
};

export async function updatePoLabelsCore(
  supabase: Client,
  id: string,
  input: UpdatePoLabelsInput,
): Promise<
  PoCoreResult<{
    id: string;
    labels_ordered: boolean;
    labels_cost: number | null;
    labels_note: string | null;
  }>
> {
  const patch: Database["public"]["Tables"]["purchase_orders"]["Update"] = {};
  if ("labels_ordered" in input) patch.labels_ordered = input.labels_ordered;
  if ("labels_cost" in input) patch.labels_cost = input.labels_cost ?? null;
  if ("labels_note" in input) {
    patch.labels_note = input.labels_note?.trim() || null;
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .update(patch)
    .eq("id", id)
    .select("id, labels_ordered, labels_cost, labels_note")
    .maybeSingle();

  if (error) {
    return { ok: false, error: dbError(error, "Failed to update labels") };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }
  return { ok: true, data };
}

/**
 * Update per-line unit costs (e.g. filling in prices on an uploaded PO that came
 * in with $0 costs), then recompute the PO subtotal/total and each line_total
 * from quantity × unit cost.
 */
export async function updatePoLineCostsCore(
  supabase: Client,
  id: string,
  costs: Array<{ id: string; unit_cost: number }>,
): Promise<PoCoreResult<{ id: string; total: number }>> {
  // Apply each line's new unit cost (scoped to this PO so a stray id can't
  // touch another order's lines).
  for (const c of costs) {
    const { error } = await supabase
      .from("po_line_items")
      .update({ unit_cost: c.unit_cost })
      .eq("id", c.id)
      .eq("purchase_order_id", id);
    if (error) {
      return { ok: false, error: dbError(error, "Failed to update line cost") };
    }
  }

  // Recompute line_total + PO subtotal/total from current lines.
  const { data: lines, error: linesError } = await supabase
    .from("po_line_items")
    .select("id, quantity, unit_cost")
    .eq("purchase_order_id", id);

  if (linesError) {
    return { ok: false, error: dbError(linesError, "Failed to reload lines") };
  }

  let total = 0;
  for (const line of lines ?? []) {
    const lineTotal =
      Math.round(Number(line.quantity) * Number(line.unit_cost) * 100) / 100;
    total += lineTotal;
    const { error: ltError } = await supabase
      .from("po_line_items")
      .update({ line_total: lineTotal })
      .eq("id", line.id);
    if (ltError) {
      return { ok: false, error: dbError(ltError, "Failed to update line total") };
    }
  }
  total = Math.round(total * 100) / 100;

  const { error: poError } = await supabase
    .from("purchase_orders")
    .update({ subtotal: total, total })
    .eq("id", id);

  if (poError) {
    return { ok: false, error: dbError(poError, "Failed to update PO total") };
  }

  return { ok: true, data: { id, total } };
}

export type PoPaymentRow = {
  id: string;
  label: string;
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_date: string | null;
};

export async function fetchPurchaseOrderDetail(
  supabase: Client,
  id: string,
): Promise<
  PoCoreResult<{
    id: string;
    po_number: string | null;
    status: string;
    order_date: string | null;
    expected_date: string | null;
    subtotal: number;
    total: number;
    notes: string | null;
    ship_date: string | null;
    tracking_number: string | null;
    carrier: string | null;
    labels_ordered: boolean;
    labels_cost: number | null;
    labels_note: string | null;
    vendor_name: string;
    payments: PoPaymentRow[];
    line_items: Array<{
      id: string;
      product_name: string;
      sku: string | null;
      style_number: string | null;
      color: string | null;
      quantity: number;
      unit_cost: number;
      line_total: number | null;
      retail_price: number | null;
      cancel_date: string | null;
    }>;
  }>
> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `id, po_number, status, order_date, expected_date, subtotal, total, notes,
       ship_date, tracking_number, carrier,
       labels_ordered, labels_cost, labels_note,
       vendors!inner ( name ),
       po_payments ( id, label, amount, due_date, paid, paid_date ),
       po_line_items (
         id, product_name, sku, style_number, color, quantity, unit_cost,
         line_total, retail_price, cancel_date
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: dbError(error, "Failed to load purchase order") };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }

  const lines = (data.po_line_items ?? []).sort((a, b) =>
    a.product_name.localeCompare(b.product_name),
  );

  const payments = (data.po_payments ?? []).sort((a, b) => {
    const aDue = a.due_date ?? "9999-12-31";
    const bDue = b.due_date ?? "9999-12-31";
    return aDue.localeCompare(bDue);
  });

  return {
    ok: true,
    data: {
      id: data.id,
      po_number: data.po_number,
      status: data.status,
      order_date: data.order_date,
      expected_date: data.expected_date,
      subtotal: data.subtotal,
      total: data.total,
      notes: data.notes,
      ship_date: data.ship_date,
      tracking_number: data.tracking_number,
      carrier: data.carrier,
      labels_ordered: data.labels_ordered,
      labels_cost: data.labels_cost,
      labels_note: data.labels_note,
      vendor_name: (data.vendors as { name: string }).name,
      payments: payments.map((p) => ({
        id: p.id,
        label: p.label,
        amount: p.amount,
        due_date: p.due_date,
        paid: p.paid,
        paid_date: p.paid_date,
      })),
      line_items: lines,
    },
  };
}

// Line items and payments cascade at the DB level; linked manufacturing
// runs and inbound email logs keep their rows with the PO reference nulled.
export async function deletePurchaseOrderCore(
  supabase: Client,
  id: string,
): Promise<PoCoreResult<{ id: string; po_number: string | null }>> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", id)
    .select("id, po_number")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: dbError(error, "Failed to delete purchase order"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Purchase order not found" },
    };
  }

  return { ok: true, data: { id: data.id, po_number: data.po_number } };
}
