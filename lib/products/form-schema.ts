import { z } from "zod";

// Shared product form schema + categories. Kept out of the "use server" action
// file because those may only export async functions.

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
    z
      .union([z.literal(""), z.string().url("Invalid image URL")])
      .transform((v) => (v.length > 0 ? v : null)),
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
