import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import {
  ManufacturingView,
} from "@/components/manufacturing/manufacturing-view";
import type {
  ManufacturingRunRow,
  ProductOption,
  PurchaseOrderOption,
  VendorOption,
} from "@/components/manufacturing/types";

export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; upload?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [runsResult, vendorsResult, posResult, productsResult] = await Promise.all([
    supabase
      .from("manufacturing_runs")
      .select(
        `id, vendor_id, purchase_order_id, product_id, product_name, variant, quantity, stage,
         expected_completion_date, expected_arrival_date, actual_completion_date,
         actual_arrival_date, notes,
         product_cost_usd, sell_price_per_unit_usd,
         air_freight_usd, sea_freight_usd,
         air_landed_per_unit_usd, sea_landed_per_unit_usd,
         air_margin_per_unit_usd, sea_margin_per_unit_usd,
         air_margin_percent, sea_margin_percent,
         created_at, updated_at,
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
    supabase
      .from("products")
      .select("id, name, sku")
      .eq("active", true)
      .order("name", { ascending: true }),
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
    product_id: row.product_id,
    product_name: row.product_name,
    variant: row.variant,
    quantity: row.quantity,
    stage: row.stage,
    expected_completion_date: row.expected_completion_date,
    expected_arrival_date: row.expected_arrival_date,
    actual_completion_date: row.actual_completion_date,
    actual_arrival_date: row.actual_arrival_date,
    notes: row.notes,
    product_cost_usd: row.product_cost_usd,
    sell_price_per_unit_usd: row.sell_price_per_unit_usd,
    air_freight_usd: row.air_freight_usd,
    sea_freight_usd: row.sea_freight_usd,
    air_landed_per_unit_usd: row.air_landed_per_unit_usd,
    sea_landed_per_unit_usd: row.sea_landed_per_unit_usd,
    air_margin_per_unit_usd: row.air_margin_per_unit_usd,
    sea_margin_per_unit_usd: row.sea_margin_per_unit_usd,
    air_margin_percent: row.air_margin_percent,
    sea_margin_percent: row.sea_margin_percent,
    created_at: row.created_at,
    updated_at: row.updated_at,
    vendor_name:
      (row.vendors as { name: string } | null)?.name ?? "Unknown vendor",
  }));

  const vendors: VendorOption[] = vendorsResult.data ?? [];
  const purchaseOrders: PurchaseOrderOption[] = posResult.data ?? [];
  const products: ProductOption[] = productsResult.data ?? [];

  return (
    <Suspense fallback={null}>
      <ManufacturingView
        initialRuns={runs}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        products={products}
        initialCreateOpen={params.new === "1"}
        initialUploadOpen={params.upload === "1"}
      />
    </Suspense>
  );
}
