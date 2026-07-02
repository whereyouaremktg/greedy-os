import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_PARSE_MODEL } from "@/lib/ai/model";
import type { InboundStream } from "@/lib/inbound/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

// Wholesale buyers are a short, known list; factories change. A buyer-name hit
// is a strong wholesale signal, factory/production vocabulary a manufacturing
// one. The LLM only breaks ties.
const WHOLESALE_BUYERS = /\b(revolve|anthropologie|jillybox|jilly\s*box)\b/i;
const MANUFACTURING_TERMS =
  /\b(proforma|pro\s*forma|pi\s*#?\s*\d|production|factory|mass\s*production|sample|mould|mold|deposit|balance\s*payment|shipment\s*from\s*(shenzhen|china|guangzhou)|bulk\s*order)\b/i;
const WHOLESALE_TERMS =
  /\b(purchase\s*order|po\s*#?\s*\d|cancel\s*date|routing\s*guide|edi|asn|wholesale|buyer)\b/i;

const classificationSchema = z.object({
  stream: z.enum(["manufacturing", "wholesale", "unknown"]),
});

/**
 * Which stream an email belongs to. `defaultStream` is the webhook the email
 * arrived on — kept unless there's clear evidence it was misrouted, so a
 * misaddressed factory email still lands on the manufacturing side.
 */
export async function classifyStream(
  supabase: Client,
  input: {
    fromEmail: string;
    subject: string | null;
    body: string;
    defaultStream: InboundStream;
  },
): Promise<InboundStream> {
  const text = `${input.subject ?? ""}\n${input.body}`.slice(0, 6000);

  const wholesaleHit = WHOLESALE_BUYERS.test(text) || WHOLESALE_TERMS.test(text);
  const manufacturingHit = MANUFACTURING_TERMS.test(text);

  // Known manufacturing vendors (anyone with a manufacturing run) named in the
  // email are a strong signal too.
  if (!wholesaleHit || manufacturingHit) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("name, manufacturing_runs!inner(id)")
      .limit(100);
    const vendorNamed = (vendors ?? []).some(
      (v) => v.name.length >= 4 && text.toLowerCase().includes(v.name.toLowerCase()),
    );
    if (vendorNamed && !wholesaleHit) return "manufacturing";
  }

  if (manufacturingHit && !wholesaleHit) return "manufacturing";
  if (wholesaleHit && !manufacturingHit) return "wholesale";
  if (!manufacturingHit && !wholesaleHit) return input.defaultStream;

  // Both matched — let the model break the tie; keep the default on failure.
  try {
    const { object } = await withModelFallback(GLOW_PARSE_MODEL, (model) =>
      generateObject({
        model,
        schema: classificationSchema,
        prompt: `Classify this email for a skincare/hair-tools brand's ops inbox.

"manufacturing" = correspondence with the FACTORY that makes our products (proforma invoices, production status, deposits, freight from China, samples).
"wholesale" = correspondence with a RETAIL BUYER that purchases from us (REVOLVE, Anthropologie, JillyBox — purchase orders, cancel dates, routing, shipping to their warehouse).
"unknown" if you can't tell.

From: ${input.fromEmail}
Subject: ${input.subject ?? "(none)"}

${text}`,
      }),
    );
    if (object.stream !== "unknown") return object.stream;
  } catch (err) {
    console.warn("[inbound/classify] LLM tie-break failed", err);
  }
  return input.defaultStream;
}
