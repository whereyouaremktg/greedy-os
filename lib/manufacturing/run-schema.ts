import { z } from "zod";

import type { ManufacturingStage } from "@/lib/manufacturing/stages";

export const MANUFACTURING_STAGE_VALUES = [
  "ordered",
  "in_production",
  "complete",
  "in_transit",
  "received",
] as const satisfies readonly ManufacturingStage[];

const stageSchema = z.enum(MANUFACTURING_STAGE_VALUES);

const optionalDateField = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Invalid date");

/** Coerce null/undefined from server-action payloads to empty string. */
function formString() {
  return z.preprocess(
    (v) => (v == null ? "" : String(v)),
    z.string(),
  );
}

const optionalUuid = formString().pipe(
  z.union([z.literal(""), z.string().uuid()]).transform((v) =>
    v.length > 0 ? v : null,
  ),
);

const optionalText = formString().pipe(
  z.string().max(2000).transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
);

const optionalProductName = formString().pipe(
  z.string().max(200).transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
);

const optionalDate = formString()
  .transform((v) => v.trim())
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
        .transform((v) => v),
    ]),
  )
  .transform((v) => (v.length > 0 ? v : null));

/** Client resolver: plain strings so RHF values stay serializable. */
export const runFormSchema = z.object({
  vendor_id: z
    .string()
    .min(1, "Select a vendor")
    .uuid("Select a vendor"),
  purchase_order_id: z.string(),
  product_id: z.string(),
  product_name: z.string().max(200),
  variant: z.string().max(2000),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  stage: stageSchema,
  expected_completion_date: optionalDateField,
  expected_arrival_date: optionalDateField,
  actual_completion_date: optionalDateField,
  actual_arrival_date: optionalDateField,
  notes: z.string().max(2000),
});

export type RunFormValues = z.infer<typeof runFormSchema>;

/** Server actions: normalize optional fields to null for the database. */
export const runSchema = z.object({
  vendor_id: formString().pipe(
    z.string().min(1, "Select a vendor").uuid("Select a vendor"),
  ),
  purchase_order_id: optionalUuid,
  product_id: optionalUuid,
  product_name: optionalProductName,
  variant: optionalText,
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  stage: stageSchema,
  expected_completion_date: optionalDate,
  expected_arrival_date: optionalDate,
  actual_completion_date: optionalDate,
  actual_arrival_date: optionalDate,
  notes: optionalText,
});

export type RunServerValues = z.output<typeof runSchema>;
