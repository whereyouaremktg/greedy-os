import { handleInboundEmail } from "@/lib/inbound/ingest";

// Postmark inbound webhook for the manufacturing stream (factory threads CC'd
// to the monitored inbox). Point the Postmark server for that address at
// /api/inbound/manufacturing-email?token=<INBOUND_EMAIL_SECRET>.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleInboundEmail(request, "manufacturing");
}
