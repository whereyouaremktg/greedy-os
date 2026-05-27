import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const parsedMoLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unit_price_usd: z.number().nonnegative().optional(),
  line_total_usd: z.number().nonnegative().optional(),
  /** True for finished goods (brush, serum). False for cartons, packaging fees, services. */
  is_finished_good: z.boolean().default(true),
  variant: z.string().max(200).optional(),
});

export const parsedManufacturingOrderSchema = z.object({
  document_type: z
    .enum(["proforma_invoice", "purchase_order", "other"])
    .default("proforma_invoice"),
  vendor_name: z
    .string()
    .min(1)
    .describe("Factory / seller name on the document, e.g. Beone Handbags"),
  pi_number: z
    .string()
    .optional()
    .describe("Proforma or PI number, e.g. PI20260407"),
  order_date: isoDate.optional(),
  currency: z.string().max(10).default("USD"),
  total_amount_usd: z.number().nonnegative().optional(),
  deposit_amount_usd: z.number().nonnegative().optional(),
  payment_terms: z.string().max(500).optional(),
  expected_completion_date: isoDate.optional(),
  expected_arrival_date: isoDate.optional(),
  production_remarks: z.string().max(2000).optional(),
  line_items: z.array(parsedMoLineItemSchema).min(1),
});

export type ParsedMoLineItem = z.infer<typeof parsedMoLineItemSchema>;
export type ParsedManufacturingOrder = z.infer<
  typeof parsedManufacturingOrderSchema
>;
