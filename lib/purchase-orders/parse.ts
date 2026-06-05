import {
  parsedPurchaseOrderSchema,
  type ParsedPurchaseOrder,
} from "@/lib/purchase-orders/schema";
import { generateObjectFromDocument } from "@/lib/documents/parse-with-llm";

const PARSE_PROMPT = `You are extracting a structured wholesale purchase order from this document. The document is a PO that a retailer/buyer (e.g. REVOLVE, a boutique, a distributor) sends to Glow Beauty (the seller). It may be a PDF, a screenshot, or a photo, and may span multiple pages. Read the ENTIRE document and capture EVERY line item across all pages — do not stop at the first page or truncate long item lists.

Identify the parties carefully:
- buyer_name = the company PLACING the order (the retailer buying from Glow). Prefer the short brand name over the legal entity (e.g. "REVOLVE" rather than "Eminent, Inc. dba Revolve Clothing"). It is NOT Glow Beauty.
- If the buyer is unclear, use the most prominent company name that is not Glow Beauty / Glow.

Numbers and identifiers:
- vendor_po_number = the PO number the buyer assigns to this order (labelled "PO #", "Vendor PO #", "Purchase Order", etc., e.g. GUTR21).
- order_number = a separate buyer order/reference number if the document shows one distinct from the PO number.
- For each line item capture as many of these as are present: product_name (description), revolve_code or any buyer item code, style_number / vendor style, color, cancel_date, quantity, unit_price (the wholesale cost per unit the buyer pays), retail_price (MSRP if shown), line_total.

Dates:
- Output every date as ISO YYYY-MM-DD. Convert any format: 03/10/26 → 2026-03-10, "Mar 10 2026" → 2026-03-10, "10/03/2026" (day/month) only if clearly DD/MM. Assume US MM/DD/YYYY unless the document is clearly otherwise.
- cancel_date is the per-line cancel/expiry date (often shown in red or a "Cancel" column). If only ONE order-level cancel date exists, put it in original_cancel_date and leave line cancel_date blank.

Totals:
- total_units and total_price should match the document's header/footer totals when shown.

Critical rules:
- NEVER invent or guess a value. If a field is missing or unreadable, OMIT it entirely rather than filling a placeholder. Optional fields left out is expected and fine.
- Do not confuse unit_price (per-unit cost) with line_total (cost × quantity).
- Numbers must be plain numbers without currency symbols or thousands separators (1234.50, not $1,234.50).
- Capture only real product line items — ignore subtotal/shipping/tax/discount summary rows as line items (they belong in the totals).`;

export type ParsePurchaseOrderResult =
  | { ok: true; data: ParsedPurchaseOrder }
  | { ok: false; error: string };

export async function parsePurchaseOrderDocument(
  buffer: Buffer,
  mediaType: string,
  kind: "image" | "pdf",
): Promise<ParsePurchaseOrderResult> {
  return generateObjectFromDocument({
    schema: parsedPurchaseOrderSchema,
    prompt: PARSE_PROMPT,
    buffer,
    mediaType,
    kind,
  });
}
