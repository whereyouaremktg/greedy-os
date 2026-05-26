import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import {
  ManufacturingView,
} from "@/components/manufacturing/manufacturing-view";
import type {
  ManufacturingRunRow,
  PurchaseOrderOption,
  VendorOption,
} from "@/components/manufacturing/types";

export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [runsResult, vendorsResult, posResult] = await Promise.all([
    supabase
      .from("manufacturing_runs")
      .select(
        `id, vendor_id, purchase_order_id, product_name, variant, quantity, stage,
         expected_completion_date, expected_arrival_date, actual_completion_date,
         actual_arrival_date, notes, created_at, updated_at,
         vendors!inner ( name )`,
      )
      .order("expected_arrival_date", {
        ascending: true,
        nullsFirst: false,
      }),
    supabase.from("vendors").select("id, name").order("name"),
    supabase
      .from("purchase_orders")
      .select("id, po_number, vendor_id")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (runsResult.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Manufacturing</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load manufacturing runs: {runsResult.error.message}
        </div>
      </div>
    );
  }

  const runs: ManufacturingRunRow[] = (runsResult.data ?? []).map((row) => ({
    id: row.id,
    vendor_id: row.vendor_id,
    purchase_order_id: row.purchase_order_id,
    product_name: row.product_name,
    variant: row.variant,
    quantity: row.quantity,
    stage: row.stage,
    expected_completion_date: row.expected_completion_date,
    expected_arrival_date: row.expected_arrival_date,
    actual_completion_date: row.actual_completion_date,
    actual_arrival_date: row.actual_arrival_date,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vendor_name:
      (row.vendors as { name: string } | null)?.name ?? "Unknown vendor",
  }));

  const vendors: VendorOption[] = vendorsResult.data ?? [];
  const purchaseOrders: PurchaseOrderOption[] = posResult.data ?? [];

  return (
    <Suspense fallback={null}>
      <ManufacturingView
        initialRuns={runs}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        initialCreateOpen={params.new === "1"}
      />
    </Suspense>
  );
}
