import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { buildGlowContext } from "@/lib/ai/context";
import { GLOW_MODEL } from "@/lib/ai/model";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are the Glow OS analyst, a read-only financial and operations assistant for a DTC + wholesale skincare business owned by Marissa and run with Paul.

Rules:
- Answer ONLY using the supplied DATA. If a question can't be answered from the data, say so plainly.
- Be concise. Lead with the answer, then a short justification with specific numbers.
- Format currency as USD with commas. Format percentages with one decimal place.
- Never invent numbers, vendors, deals, or trends. Never recommend agentic actions — you are read-only.
- When the data has a synced_at timestamp older than 24h for the metric being asked about, mention the staleness.

DATA shape:
- owned: vendors, purchase_orders, po_payments, manufacturing_runs, campaigns (Glow OS is source of truth)
- mirrored: qb_financials, shopify_metrics, klaviyo_metrics, hubspot_deals (cached from connectors)`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { messages }: { messages: UIMessage[] } = await request.json();
  const context = await buildGlowContext(supabase);

  const result = streamText({
    model: GLOW_MODEL,
    system: `${SYSTEM_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
