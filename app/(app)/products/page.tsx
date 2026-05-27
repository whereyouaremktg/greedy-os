import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  ProductTable,
  type ProductRow,
} from "@/components/products/product-table";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*, manufacturing_runs(count)")
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load products: {error.message}
        </div>
      </div>
    );
  }

  const products: ProductRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    unit: row.unit,
    active: row.active,
    image_url: row.image_url,
    notes: row.notes,
    shopify_product_id: row.shopify_product_id,
    shopify_handle: row.shopify_handle,
    updated_at: row.updated_at,
    manufacturing_count: row.manufacturing_runs?.[0]?.count ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <ProductTable
          products={products}
          initialCreateOpen={params.new === "1"}
        />
      </Suspense>
    </div>
  );
}
