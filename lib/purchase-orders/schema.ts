import { z } from "zod";

export const parsedLineItemSchema = z.object({
  product_name: z.string().min(1),
  id_number: z.string().optional(),
  revolve_code: z.string().optional(),
  style_number: z.string().optional(),
  color: z.string().optional(),
  cancel_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional(),
  quantity: z.number().positive(),
  unit_price: z.number().nonnegative(),
  retail_price: z.number().nonnegative().optional(),
  line_total: z.number().nonnegative().optional(),
});

export const parsedPurchaseOrderSchema = z.object({
  buyer_name: z
    .string()
    .min(1)
    .describe("Company placing the order, e.g. REVOLVE"),
  vendor_po_number: z
    .string()
    .optional()
    .describe("Vendor PO # shown on the document"),
  order_number: z
    .string()
    .optional()
    .describe("Buyer order number at top of document"),
  order_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional(),
  original_cancel_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  season: z.string().optional(),
  department: z.string().optional(),
  buyer_contact: z.string().optional(),
  payment_terms: z.string().optional(),
  total_units: z.number().nonnegative().optional(),
  total_price: z.number().nonnegative().optional(),
  line_items: z.array(parsedLineItemSchema).min(1),
});

export type ParsedLineItem = z.infer<typeof parsedLineItemSchema>;
export type ParsedPurchaseOrder = z.infer<typeof parsedPurchaseOrderSchema>;

export const poLineItemInputSchema = z.object({
  product_name: z.string().min(1).max(500),
  sku: z.string().max(100).optional(),
  style_number: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
  quantity: z.number().positive(),
  unit_cost: z.number().nonnegative(),
  retail_price: z.number().nonnegative().optional(),
  cancel_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const createPurchaseOrderInputSchema = z.object({
  vendor_id: z.string().uuid().optional(),
  vendor_name: z.string().min(1).max(200).optional(),
  po_number: z.string().max(100).optional(),
  status: z
    .enum([
      "draft",
      "sent",
      "confirmed",
      "in_fulfillment",
      "shipped",
      "partially_received",
      "received",
      "closed",
      "cancelled",
    ])
    .default("confirmed"),
  currency: z.string().max(10).default("USD"),
  order_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  expected_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  subtotal: z.number().nonnegative().optional(),
  total: z.number().nonnegative(),
  notes: z.string().max(4000).optional(),
  line_items: z.array(poLineItemInputSchema).min(1),
});

export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderInputSchema
>;

export function buildPoNotes(parsed: ParsedPurchaseOrder): string | null {
  const parts = [
    parsed.order_number ? `Order #: ${parsed.order_number}` : null,
    parsed.season ? `Season: ${parsed.season}` : null,
    parsed.department ? `Dept: ${parsed.department}` : null,
    parsed.buyer_contact ? `Buyer: ${parsed.buyer_contact}` : null,
    parsed.payment_terms ? `Terms: ${parsed.payment_terms}` : null,
    parsed.original_cancel_date
      ? `Original cancel: ${parsed.original_cancel_date}`
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : null;
}

export function latestCancelDate(
  lineItems: Array<{ cancel_date?: string | null }>,
): string | null {
  const dates = lineItems
    .map((l) => l.cancel_date)
    .filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? null;
}

export function parsedToCreateInput(
  parsed: ParsedPurchaseOrder,
  vendorId?: string,
): CreatePurchaseOrderInput {
  const lineItems = parsed.line_items.map((item) => ({
    product_name: item.product_name,
    sku: item.revolve_code ?? item.style_number ?? undefined,
    style_number: item.style_number,
    color: item.color,
    quantity: item.quantity,
    unit_cost: item.unit_price,
    retail_price: item.retail_price,
    cancel_date: item.cancel_date,
  }));

  // Header totals are optional on the document; fall back to the sum of line
  // items (qty × unit price) so a PO without a printed total still saves.
  const computedTotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0,
  );
  const total = parsed.total_price ?? computedTotal;

  return {
    vendor_id: vendorId,
    vendor_name: parsed.buyer_name,
    po_number: parsed.vendor_po_number ?? parsed.order_number,
    status: "confirmed",
    currency: "USD",
    order_date: parsed.order_date,
    expected_date:
      latestCancelDate(lineItems) ?? parsed.original_cancel_date ?? undefined,
    subtotal: parsed.total_price ?? computedTotal,
    total,
    notes: buildPoNotes(parsed) ?? undefined,
    line_items: lineItems,
  };
}
