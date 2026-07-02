import type { SupabaseClient } from "@supabase/supabase-js";

import { createRunCore } from "@/lib/manufacturing/core";
import { parsedToCreateRunInput } from "@/lib/manufacturing/from-parsed";
import { parseManufacturingOrderDocument } from "@/lib/manufacturing/parse";
import { createPurchaseOrderCore } from "@/lib/purchase-orders/core";
import {
  parsePurchaseOrderDocument,
  parsePurchaseOrderText,
} from "@/lib/purchase-orders/parse";
import { parsedToCreateInput } from "@/lib/purchase-orders/schema";
import { senderDomain } from "@/lib/inbound/thread";
import type {
  InboundStream,
  MatchedEntityType,
} from "@/lib/inbound/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

const OPEN_PO_STATUSES = [
  "draft",
  "sent",
  "confirmed",
  "in_fulfillment",
  "shipped",
  "partially_received",
] as const;

const OPEN_RUN_STAGES = ["ordered", "in_production", "complete", "in_transit"] as const;

export type LinkResult =
  | {
      ok: true;
      entityType: MatchedEntityType;
      entityId: string;
      created: boolean;
      via: "thread" | "reference" | "vendor" | "attachment";
    }
  | { ok: false; reason: string };

/** PI/PO-style reference numbers in an email ("PI20260407", "PO #4821"…). */
export function extractReferenceNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:p\.?[io]\.?|order|proforma)\s*#?\s*:?\s*([a-z0-9][a-z0-9-]{2,19})\b/gi)) {
    out.add(m[1].toUpperCase());
  }
  // Bare PI/PO-prefixed codes like PI20260407 / PO4821.
  for (const m of text.matchAll(/\b(p[io]\d{3,12})\b/gi)) {
    out.add(m[1].toUpperCase());
  }
  return [...out].slice(0, 10);
}

async function inheritFromThread(
  supabase: Client,
  threadKey: string,
  excludeMessageDbId: string,
): Promise<{ entityType: MatchedEntityType; entityId: string } | null> {
  const { data } = await supabase
    .from("inbound_messages")
    .select("matched_entity_type, matched_entity_id")
    .eq("thread_key", threadKey)
    .neq("id", excludeMessageDbId)
    .not("matched_entity_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.matched_entity_id || !data.matched_entity_type) return null;
  return {
    entityType: data.matched_entity_type as MatchedEntityType,
    entityId: data.matched_entity_id,
  };
}

async function matchRunByReference(
  supabase: Client,
  refs: string[],
): Promise<string | null> {
  for (const ref of refs) {
    // PI numbers live in run notes ("PI: PI20260407") — no dedicated column.
    const { data } = await supabase
      .from("manufacturing_runs")
      .select("id")
      .ilike("notes", `%${ref}%`)
      .in("stage", [...OPEN_RUN_STAGES])
      .limit(2);
    if (data?.length === 1) return data[0].id;
  }
  return null;
}

async function matchPoByReference(
  supabase: Client,
  refs: string[],
): Promise<string | null> {
  for (const ref of refs) {
    const { data } = await supabase
      .from("purchase_orders")
      .select("id")
      .ilike("po_number", ref)
      .in("status", [...OPEN_PO_STATUSES])
      .limit(2);
    if (data?.length === 1) return data[0].id;
  }
  return null;
}

/**
 * Match by counterparty: find the vendor whose name appears in the sender
 * domain / subject / body, then link ONLY if that vendor has exactly one open
 * run/PO. Never guesses across vendors or between two open orders.
 */
async function matchByVendor(
  supabase: Client,
  stream: InboundStream,
  fromEmail: string,
  text: string,
): Promise<string | null> {
  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name")
    .limit(500);
  if (!vendors?.length) return null;

  const domain = senderDomain(fromEmail);
  const haystack = text.toLowerCase();
  const matched = vendors.filter((v) => {
    const name = v.name.toLowerCase();
    if (name.length < 4) return false;
    const compact = name.replace(/[^a-z0-9]/g, "");
    return haystack.includes(name) || (compact.length >= 4 && domain.includes(compact));
  });
  if (matched.length !== 1) return null;

  if (stream === "manufacturing") {
    const { data } = await supabase
      .from("manufacturing_runs")
      .select("id")
      .eq("vendor_id", matched[0].id)
      .in("stage", [...OPEN_RUN_STAGES])
      .limit(2);
    return data?.length === 1 ? data[0].id : null;
  }
  const { data } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("vendor_id", matched[0].id)
    .in("status", [...OPEN_PO_STATUSES])
    .limit(2);
  return data?.length === 1 ? data[0].id : null;
}

/** Create the run/PO from a proforma / PO document attached to the email. */
async function createFromAttachment(
  supabase: Client,
  stream: InboundStream,
  attachment: { buffer: Buffer; mediaType: string; kind: "pdf" | "image" } | null,
  bodyText: string,
): Promise<{ entityId: string } | null> {
  if (stream === "manufacturing") {
    if (!attachment) return null;
    const parsed = await parseManufacturingOrderDocument(
      attachment.buffer,
      attachment.mediaType,
      attachment.kind,
    );
    if (!parsed.ok) return null;
    const runInput = await parsedToCreateRunInput(supabase, null, parsed.data);
    if (!runInput.ok) return null;
    const created = await createRunCore(supabase, null, runInput.input);
    return created.ok ? { entityId: created.data.id } : null;
  }

  const parsed = attachment
    ? await parsePurchaseOrderDocument(
        attachment.buffer,
        attachment.mediaType,
        attachment.kind,
      )
    : bodyText.trim()
      ? await parsePurchaseOrderText(bodyText)
      : null;
  if (!parsed?.ok) return null;
  const created = await createPurchaseOrderCore(
    supabase,
    null,
    parsedToCreateInput(parsed.data),
  );
  return created.ok ? { entityId: created.data.id } : null;
}

export async function linkMessageToEntity(
  supabase: Client,
  input: {
    messageDbId: string;
    threadKey: string;
    stream: InboundStream;
    fromEmail: string;
    subject: string | null;
    bodyText: string;
    attachment: { buffer: Buffer; mediaType: string; kind: "pdf" | "image" } | null;
  },
): Promise<LinkResult> {
  const entityType: MatchedEntityType =
    input.stream === "manufacturing" ? "manufacturing_run" : "purchase_order";
  const searchText = `${input.subject ?? ""}\n${input.bodyText}`;

  // (a/b) The thread is already linked → inherit.
  const inherited = await inheritFromThread(
    supabase,
    input.threadKey,
    input.messageDbId,
  );
  if (inherited) return { ok: true, ...inherited, created: false, via: "thread" };

  // (c) PI / PO number in subject or body.
  const refs = extractReferenceNumbers(searchText);
  if (refs.length > 0) {
    const id =
      input.stream === "manufacturing"
        ? await matchRunByReference(supabase, refs)
        : await matchPoByReference(supabase, refs);
    if (id) return { ok: true, entityType, entityId: id, created: false, via: "reference" };
  }

  // (c continued) unambiguous vendor with exactly one open order.
  const byVendor = await matchByVendor(
    supabase,
    input.stream,
    input.fromEmail,
    searchText,
  );
  if (byVendor) {
    return { ok: true, entityType, entityId: byVendor, created: false, via: "vendor" };
  }

  // (d) A proforma/PO document is attached and nothing matched → new order.
  const created = await createFromAttachment(
    supabase,
    input.stream,
    input.attachment,
    input.bodyText,
  );
  if (created) {
    return { ok: true, entityType, entityId: created.entityId, created: true, via: "attachment" };
  }

  // (e) Ambiguous — a human decides.
  return {
    ok: false,
    reason: refs.length
      ? `No open ${entityType.replace("_", " ")} matched refs ${refs.join(", ")}`
      : "No PO/PI reference, vendor match, or parseable attachment",
  };
}
