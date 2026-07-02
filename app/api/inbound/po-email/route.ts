import { handleInboundEmail } from "@/lib/inbound/ingest";

// Postmark inbound webhook for the wholesale stream (buyer PO threads). This
// URL predates the shared pipeline — it stays as-is so the existing Postmark
// server config keeps working. The old one-shot "create a PO from the email"
// behavior is preserved inside the pipeline: an unmatched email with a PO
// attachment (or PO table in the body) still creates the purchase order.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleInboundEmail(request, "wholesale");
}
