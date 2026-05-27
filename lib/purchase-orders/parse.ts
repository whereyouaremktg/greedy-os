import { generateObject } from "ai";

import { GLOW_MODEL } from "@/lib/ai/model";
import {
  parsedPurchaseOrderSchema,
  type ParsedPurchaseOrder,
} from "@/lib/purchase-orders/schema";

const PARSE_PROMPT = `Extract a structured purchase order from this document image.

This is typically a wholesale buyer PO (e.g. REVOLVE) sent to Glow Beauty. Extract every line item visible.

Rules:
- Dates must be ISO format YYYY-MM-DD. Convert MM/DD/YY or similar (e.g. 03/10/26 → 2026-03-10).
- buyer_name is the company placing the order (e.g. "REVOLVE" or "Eminent, Inc. dba Revolve Clothing" — prefer the short brand name "REVOLVE").
- vendor_po_number is the "Vendor PO #" field (e.g. GUTR21).
- order_number is the buyer's order number at the top if different.
- For each line item, capture product_name, revolve_code, style_number, color, cancel_date, quantity, unit_price, retail_price, and line_total.
- Use the per-style cancel date shown in red for each line item's cancel_date.
- total_units and total_price should match document header totals when visible.
- If a field is missing, omit it rather than guessing.`;

export type ParsePurchaseOrderResult =
  | { ok: true; data: ParsedPurchaseOrder }
  | { ok: false; error: string };

export async function parsePurchaseOrderDocument(
  buffer: Buffer,
  mediaType: string,
): Promise<ParsePurchaseOrderResult> {
  try {
    const { object } = await generateObject({
      model: GLOW_MODEL,
      schema: parsedPurchaseOrderSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PARSE_PROMPT },
            {
              type: "image",
              image: buffer,
              mediaType: mediaType as "image/png" | "image/jpeg" | "image/webp",
            },
          ],
        },
      ],
    });

    return { ok: true, data: object };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to parse purchase order document",
    };
  }
}
