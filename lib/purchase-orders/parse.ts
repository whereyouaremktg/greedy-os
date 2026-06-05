import {
  parsedPurchaseOrderSchema,
  type ParsedPurchaseOrder,
} from "@/lib/purchase-orders/schema";
import { generateObjectFromDocument } from "@/lib/documents/parse-with-llm";

const PARSE_PROMPT = `You are extracting a structured wholesale purchase order from this document. It is an order that a retailer/buyer (e.g. REVOLVE, Anthropologie, a boutique, a distributor) is placing with Glow Beauty (the seller). The format VARIES widely — it may be a formal PO PDF, a screenshot, a photo, or an EMAIL containing a reorder request with a small table. It may span multiple pages. Read the ENTIRE document and capture EVERY product line — do not stop at the first page or truncate the list.

Identify the BUYER carefully — this is the most common mistake:
- buyer_name = the company PLACING the order (the retailer buying FROM Glow). In an email, this is the SENDER / the company in their signature, letterhead, or "from" line (e.g. "ANTHROPOLOGIE", "REVOLVE").
- It is NEVER Glow Beauty / Glow / Glow Beauty Hair — that is the seller.
- IGNORE any "BRAND" column or product-brand label that says "Glow Beauty" — that names the product's manufacturer, NOT the buyer. The buyer comes from who SENT the order.
- Prefer the short brand name over the legal entity (e.g. "REVOLVE" not "Eminent, Inc. dba Revolve Clothing").

Numbers and identifiers:
- vendor_po_number = the PO/order number the buyer assigns ("PO #", "Vendor PO #", "Purchase Order", e.g. GUTR21). If the email says a PO will follow later and shows no number, omit it.
- For each line, the QUANTITY may appear under varied headers: "Qty", "Units", "DIRECT", "Direct Ship", "Order Qty". Map whichever column holds the number of units ordered to quantity (e.g. a "DIRECT" value of 60 means quantity 60).
- product_name = the item description ("DESCRIPTION" column or similar).
- style_number = the seller's style/vendor code ("VENDOR STYLE", "Style", e.g. OG-010).
- revolve_code / id_number = the buyer's own item code or long SKU ("LONGSKU", buyer item #).
- unit_price = the wholesale COST per unit the buyer pays. Many reorder emails do NOT show a cost — if there is no cost/price-paid column, OMIT unit_price entirely (do not use the retail price as the cost, and do not put 0).
- retail_price = MSRP if shown ("RETAIL"). A retail of 0 means not provided — omit it.

Dates:
- Output every date as ISO YYYY-MM-DD. Convert any format: 03/10/26 → 2026-03-10, "Mar 10" / "June 4th" → that calendar date in the order's year, "10/03/2026" only as DD/MM if clearly so. Assume US MM/DD/YYYY otherwise.
- A requested delivery/ship/"in DC" date ("June 4th delivery", "6/4 NDC") is the order's expected date → put it in original_cancel_date (and order_date if that's the only date present).
- cancel_date is a per-line cancel/expiry date (often red or a "Cancel" column); omit if absent.

Totals:
- total_units / total_price should match the document's header/footer totals WHEN shown; omit if the document has none.

Critical rules:
- NEVER invent or guess a value. If a field is missing or unreadable, OMIT it — optional fields left out is expected and correct.
- Do not confuse unit_price (per-unit cost) with line_total, retail price, or a SKU.
- Numbers must be plain (1234.50, not $1,234.50); no currency symbols or thousands separators.
- Capture only real product lines — ignore subtotal/shipping/tax/header rows.`;

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
