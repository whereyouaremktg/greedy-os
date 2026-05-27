import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type ProductCoreError = { code: string; message: string };

export type ProductCoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ProductCoreError };

export const createProductInput = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(100).optional(),
  category: z.string().max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  image_url: z.string().url().max(2000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
  active: z.boolean().optional(),
});

export const updateProductInput = createProductInput.partial();

export type ShopifyProductInput = {
  shopify_product_id: string;
  shopify_handle: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  category?: string | null;
  active?: boolean;
};

function dbError(
  err: { code?: string; message?: string } | null,
  fallback: string,
): ProductCoreError {
  return {
    code: err?.code ?? "DB_ERROR",
    message: err?.message ?? fallback,
  };
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createProductCore(
  supabase: Client,
  actorUserId: string | null,
  input: z.infer<typeof createProductInput>,
): Promise<ProductCoreResult<{ id: string; name: string }>> {
  const row: Database["public"]["Tables"]["products"]["Insert"] = {
    name: input.name.trim(),
    sku: normalizeOptionalText(input.sku),
    category: normalizeOptionalText(input.category),
    unit: input.unit?.trim() || "unit",
    image_url: normalizeOptionalText(input.image_url),
    active: input.active ?? true,
    notes: normalizeOptionalText(input.notes),
    ...(actorUserId ? { created_by: actorUserId } : {}),
  };

  const { data, error } = await supabase
    .from("products")
    .insert(row)
    .select("id, name")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to create product"),
    };
  }

  return { ok: true, data: { id: data.id, name: data.name } };
}

export async function updateProductCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
  input: z.infer<typeof updateProductInput>,
): Promise<ProductCoreResult<{ id: string; name: string }>> {
  const patch: Database["public"]["Tables"]["products"]["Update"] = {};

  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.sku !== undefined) patch.sku = normalizeOptionalText(input.sku);
  if (input.category !== undefined) {
    patch.category = normalizeOptionalText(input.category);
  }
  if (input.unit !== undefined) patch.unit = input.unit.trim() || "unit";
  if (input.image_url !== undefined) {
    patch.image_url = normalizeOptionalText(input.image_url);
  }
  if (input.notes !== undefined) patch.notes = normalizeOptionalText(input.notes);
  if (input.active !== undefined) patch.active = input.active;

  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Product not found" },
      };
    }
    return {
      ok: false,
      error: dbError(error, "Failed to update product"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Product not found" },
    };
  }

  return { ok: true, data: { id: data.id, name: data.name } };
}

export async function deactivateProductCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
): Promise<ProductCoreResult<{ id: string; active: false }>> {
  const { data, error } = await supabase
    .from("products")
    .update({ active: false })
    .eq("id", id)
    .select("id, active")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Product not found" },
      };
    }
    return {
      ok: false,
      error: dbError(error, "Failed to deactivate product"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Product not found" },
    };
  }

  return { ok: true, data: { id: data.id, active: false } };
}

export async function upsertProductFromShopify(
  supabase: Client,
  _actorUserId: string | null,
  shopifyProduct: ShopifyProductInput,
): Promise<ProductCoreResult<{ id: string; name: string }>> {
  const row: Database["public"]["Tables"]["products"]["Insert"] = {
    shopify_product_id: shopifyProduct.shopify_product_id,
    shopify_handle: shopifyProduct.shopify_handle,
    name: shopifyProduct.name.trim(),
    sku: shopifyProduct.sku,
    image_url: shopifyProduct.image_url,
    category: shopifyProduct.category ?? null,
    unit: "unit",
    active: shopifyProduct.active ?? true,
  };

  const { data, error } = await supabase
    .from("products")
    .upsert(row, { onConflict: "shopify_product_id" })
    .select("id, name")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to upsert Shopify product"),
    };
  }

  return { ok: true, data: { id: data.id, name: data.name } };
}
