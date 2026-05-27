"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createProductCore,
  deactivateProductCore,
  updateProductCore,
} from "@/lib/products/core";
import { runShopifyProductSync } from "@/lib/products/shopify-sync";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type SyncResult =
  | { ok: true; synced: number; errors: string[] }
  | { ok: false; error: string };

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalSku = z
  .string()
  .max(100)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalUrl = z
  .string()
  .max(2000)
  .transform((v) => v.trim())
  .pipe(
    z.union([z.literal(""), z.string().url("Invalid image URL")]).transform((v) =>
      v.length > 0 ? v : null,
    ),
  );

export const PRODUCT_CATEGORIES = [
  "Skincare",
  "Haircare",
  "Accessories",
  "Tools",
  "Other",
] as const;

export const productSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Name is required")),
  sku: optionalSku,
  category: optionalText,
  unit: z
    .string()
    .max(50)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Unit is required"))
    .default("unit"),
  image_url: optionalUrl,
  active: z.boolean(),
  notes: optionalText,
});

export type ProductFormValues = z.input<typeof productSchema>;

const idSchema = z.string().uuid();

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

function describeError(
  err: { code?: string | null; message?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!err) return fallback;
  if (err.code === "23505") {
    return "A product with this SKU already exists.";
  }
  return err.message ?? fallback;
}

async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase, user: null, error: "You must be signed in" } as const;
  }
  return { supabase, user, error: null } as const;
}

export async function createProduct(
  input: ProductFormValues,
): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const auth = await getAuthedClient();
  if (auth.error) return { ok: false, error: auth.error };

  const created = await createProductCore(auth.supabase, auth.user!.id, {
    name: parsed.data.name,
    sku: parsed.data.sku ?? undefined,
    category: parsed.data.category ?? undefined,
    unit: parsed.data.unit,
    image_url: parsed.data.image_url ?? undefined,
    active: parsed.data.active,
    notes: parsed.data.notes ?? undefined,
  });

  if (!created.ok) {
    return { ok: false, error: created.error.message };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function updateProduct(
  id: string,
  input: ProductFormValues,
): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid product id" };
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const auth = await getAuthedClient();
  if (auth.error) return { ok: false, error: auth.error };

  const updated = await updateProductCore(
    auth.supabase,
    auth.user!.id,
    idResult.data,
    {
      name: parsed.data.name,
      sku: parsed.data.sku ?? undefined,
      category: parsed.data.category ?? undefined,
      unit: parsed.data.unit,
      image_url: parsed.data.image_url ?? undefined,
      active: parsed.data.active,
      notes: parsed.data.notes ?? undefined,
    },
  );

  if (!updated.ok) {
    return { ok: false, error: describeError(updated.error, "Failed to update product") };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function deactivateProduct(id: string): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid product id" };
  }

  const auth = await getAuthedClient();
  if (auth.error) return { ok: false, error: auth.error };

  const result = await deactivateProductCore(
    auth.supabase,
    auth.user!.id,
    idResult.data,
  );

  if (!result.ok) {
    return {
      ok: false,
      error: describeError(result.error, "Failed to deactivate product"),
    };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function syncProductsFromShopify(): Promise<SyncResult> {
  const auth = await getAuthedClient();
  if (auth.error) return { ok: false, error: auth.error };

  try {
    const result = await runShopifyProductSync(auth.supabase, auth.user!.id);
    revalidatePath("/products");
    return {
      ok: true,
      synced: result.synced,
      errors: result.errors,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Shopify sync failed",
    };
  }
}
