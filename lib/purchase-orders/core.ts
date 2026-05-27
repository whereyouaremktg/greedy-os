import type { SupabaseClient } from "@supabase/supabase-js";

import { findOrCreateVendorByName as findOrCreateVendorByNameLookup } from "@/lib/vendors/lookup";
import type { CreatePurchaseOrderInput } from "@/lib/purchase-orders/schema";
import { latestCancelDate } from "@/lib/purchase-orders/schema";
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
    vendor_name: string;
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
       vendors!inner ( name ),
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
      vendor_name: (data.vendors as { name: string }).name,
      line_items: lines,
    },
  };
}
