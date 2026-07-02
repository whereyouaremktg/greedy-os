import { Suspense } from "react";

import { PoView } from "@/components/purchase-orders/po-view";
import type { PoRow } from "@/components/purchase-orders/types";
import { createClient } from "@/lib/supabase/server";
import { NeedsAttention } from "@/components/inbound/needs-attention";

function summarizePayments(
  payments: Array<{ amount: number; paid: boolean }>,
): PoRow["payments"] {
  const unpaid = payments.filter((p) => !p.paid);
  return {
    unpaid_count: unpaid.length,
    unpaid_total: unpaid.reduce((sum, p) => sum + Number(p.amount), 0),
    all_paid: payments.length > 0 && unpaid.length === 0,
  };
}

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `id, po_number, status, order_date, expected_date, ship_date,
       tracking_number, carrier, labels_ordered, total, updated_at,
       vendors!inner ( name ),
       po_line_items ( quantity ),
       po_payments ( amount, paid )`,
    )
    .order("order_date", { ascending: false, nullsFirst: false });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Purchase Orders
        </h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load purchase orders: {error.message}
        </div>
      </div>
    );
  }

  const orders: PoRow[] = (data ?? []).map((row) => {
    const lines = row.po_line_items ?? [];
    const totalUnits = lines.reduce(
      (sum, line) => sum + Number(line.quantity),
      0,
    );

    return {
      id: row.id,
      po_number: row.po_number,
      status: row.status,
      order_date: row.order_date,
      expected_date: row.expected_date,
      ship_date: row.ship_date,
      tracking_number: row.tracking_number,
      carrier: row.carrier,
      labels_ordered: row.labels_ordered,
      total: row.total,
      vendor_name:
        (row.vendors as { name: string } | null)?.name ?? "Unknown buyer",
      line_item_count: lines.length,
      total_units: totalUnits,
      updated_at: row.updated_at,
      payments: summarizePayments(row.po_payments ?? []),
    };
  });

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <NeedsAttention stream="wholesale" />
      </Suspense>
      <Suspense fallback={null}>
        <PoView orders={orders} initialUploadOpen={params.new === "1"} />
      </Suspense>
    </div>
  );
}
