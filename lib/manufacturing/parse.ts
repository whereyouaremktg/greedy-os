import { generateObject } from "ai";

import { GLOW_MODEL } from "@/lib/ai/model";
import {
  parsedManufacturingOrderSchema,
  type ParsedManufacturingOrder,
} from "@/lib/manufacturing/parse-schema";

const PARSE_PROMPT = `Extract a factory manufacturing order from this document image.

This is typically a PROFORMA INVOICE or factory PO from a manufacturer (e.g. Shenzhen handbag/brush factory) TO Glow Beauty / the buyer.

Rules:
- vendor_name = the SELLER / factory on the document (not the buyer "Sold To").
- pi_number = PI / Proforma Invoice number if shown.
- Dates must be ISO YYYY-MM-DD. Convert MM-DD-YYYY or DD-MM-YYYY (e.g. 07-04-2026 → 2026-07-04).
- line_items: extract every row with description, quantity, unit price, and line total when visible.
- Mark is_finished_good=true only for the actual product being manufactured (brush, bag, serum, etc.).
- Mark is_finished_good=false for cartons, packaging, packaging fee, shipping, MOQ fees, or service lines.
- variant: color, size, or style notes from the product description if present.
- expected_completion_date / expected_arrival_date: infer from delivery remarks (e.g. "early April" → 2026-04-15 if order is early 2026). Omit if unclear.
- production_remarks: payment terms, deposit %, delivery notes, bank info summary (one short paragraph max).
- total_amount_usd and deposit_amount_usd when visible.
- If a field is missing, omit it rather than guessing quantities or dates.`;

export type ParseManufacturingOrderResult =
  | { ok: true; data: ParsedManufacturingOrder }
  | { ok: false; error: string };

export async function parseManufacturingOrderDocument(
  buffer: Buffer,
  mediaType: string,
): Promise<ParseManufacturingOrderResult> {
  try {
    const { object } = await generateObject({
      model: GLOW_MODEL,
      schema: parsedManufacturingOrderSchema,
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
          : "Failed to parse manufacturing order document",
    };
  }
}
