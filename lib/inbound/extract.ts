import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_PARSE_MODEL } from "@/lib/ai/model";
import {
  appendRunNotesCore,
  updateRunDatesCore,
  updateRunStageCore,
} from "@/lib/manufacturing/core";
import { MANUFACTURING_STAGES, type ManufacturingStage } from "@/lib/manufacturing/stages";
import {
  updatePoDetailsCore,
  updatePoShipmentCore,
} from "@/lib/purchase-orders/core";
import type { PoStatus } from "@/lib/purchase-orders/statuses";
import type { MatchedEntityType } from "@/lib/inbound/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const extractionSchema = z.object({
  summary: z
    .string()
    .max(600)
    .describe("2-3 sentence status of the order per this thread, newest first"),
  updates: z.object({
    expected_completion_date: isoDate.optional(),
    expected_arrival_date: isoDate.optional(),
    actual_completion_date: isoDate.optional(),
    actual_arrival_date: isoDate.optional(),
    stage: z.enum(["ordered", "in_production", "complete", "in_transit", "received"]).optional(),
    po_status: z
      .enum(["confirmed", "in_fulfillment", "shipped", "partially_received", "received", "closed"])
      .optional(),
    ship_date: isoDate.optional(),
    tracking_number: z.string().max(100).optional(),
    carrier: z.string().max(60).optional(),
    quantity: z.number().int().positive().optional(),
    unit_price_usd: z.number().nonnegative().optional(),
    payment_status: z.string().max(200).optional(),
  }),
  missing: z
    .array(z.string().max(120))
    .max(8)
    .describe("Info we still need from the counterparty (no ETA, no ship date, unanswered question)"),
  open_questions: z
    .array(z.string().max(200))
    .max(8)
    .describe("Questions asked in the thread that have no answer yet"),
  risky_changes: z
    .array(z.string().max(200))
    .max(8)
    .describe("Changes mentioned that need human sign-off: quantity cuts, cancellations, price increases, order splits"),
  confidence: z.enum(["high", "medium", "low"]),
});

export type Extraction = z.infer<typeof extractionSchema>;

export type ThreadMessage = {
  from_email: string | null;
  subject: string | null;
  text_body: string | null;
  received_at: string;
};

export type EntityState =
  | {
      type: "manufacturing_run";
      id: string;
      vendorName: string;
      record: Pick<
        Database["public"]["Tables"]["manufacturing_runs"]["Row"],
        | "product_name"
        | "variant"
        | "quantity"
        | "stage"
        | "expected_completion_date"
        | "expected_arrival_date"
        | "actual_completion_date"
        | "actual_arrival_date"
        | "notes"
      >;
    }
  | {
      type: "purchase_order";
      id: string;
      vendorName: string;
      record: Pick<
        Database["public"]["Tables"]["purchase_orders"]["Row"],
        | "po_number"
        | "status"
        | "order_date"
        | "expected_date"
        | "ship_date"
        | "tracking_number"
        | "carrier"
        | "total"
        | "notes"
      >;
    };

export async function fetchEntityState(
  supabase: Client,
  entityType: MatchedEntityType,
  entityId: string,
): Promise<EntityState | null> {
  if (entityType === "manufacturing_run") {
    const { data } = await supabase
      .from("manufacturing_runs")
      .select(
        "id, product_name, variant, quantity, stage, expected_completion_date, expected_arrival_date, actual_completion_date, actual_arrival_date, notes, vendors(name)",
      )
      .eq("id", entityId)
      .maybeSingle();
    if (!data) return null;
    return {
      type: "manufacturing_run",
      id: data.id,
      vendorName: (data.vendors as { name: string } | null)?.name ?? "Unknown vendor",
      record: data,
    };
  }
  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_number, status, order_date, expected_date, ship_date, tracking_number, carrier, total, notes, vendors(name)",
    )
    .eq("id", entityId)
    .maybeSingle();
  if (!data) return null;
  return {
    type: "purchase_order",
    id: data.id,
    vendorName: (data.vendors as { name: string } | null)?.name ?? "Unknown vendor",
    record: data,
  };
}

export async function fetchThreadMessages(
  supabase: Client,
  entityType: MatchedEntityType,
  entityId: string,
): Promise<ThreadMessage[]> {
  const { data } = await supabase
    .from("inbound_messages")
    .select("from_email, subject, text_body, received_at")
    .eq("matched_entity_type", entityType)
    .eq("matched_entity_id", entityId)
    .order("received_at", { ascending: true })
    .limit(40);
  return data ?? [];
}

function describeRecord(entity: EntityState): string {
  if (entity.type === "manufacturing_run") {
    const r = entity.record;
    return [
      `Type: manufacturing run (factory order)`,
      `Factory: ${entity.vendorName}`,
      `Product: ${r.product_name}${r.variant ? ` (${r.variant})` : ""}`,
      `Quantity: ${r.quantity}`,
      `Stage: ${r.stage}`,
      `Expected completion: ${r.expected_completion_date ?? "unknown"}`,
      `Expected arrival: ${r.expected_arrival_date ?? "unknown"}`,
      `Actual completion: ${r.actual_completion_date ?? "—"}`,
      `Actual arrival: ${r.actual_arrival_date ?? "—"}`,
      r.notes ? `Notes:\n${r.notes.slice(0, 1500)}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  const r = entity.record;
  return [
    `Type: wholesale purchase order (retail buyer purchasing from us)`,
    `Buyer: ${entity.vendorName}`,
    `PO #: ${r.po_number ?? "unknown"}`,
    `Status: ${r.status}`,
    `Order date: ${r.order_date ?? "unknown"}`,
    `Expected/cancel date: ${r.expected_date ?? "unknown"}`,
    `Ship date: ${r.ship_date ?? "—"}`,
    `Tracking: ${r.tracking_number ?? "—"} (${r.carrier ?? "no carrier"})`,
    `Total: $${r.total}`,
    r.notes ? `Notes:\n${r.notes.slice(0, 1500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatThread(messages: ThreadMessage[]): string {
  return messages
    .map(
      (m) =>
        `--- ${m.received_at.slice(0, 10)} · from ${m.from_email ?? "unknown"} · "${m.subject ?? "(no subject)"}"\n${(m.text_body ?? "").slice(0, 4000)}`,
    )
    .join("\n\n")
    .slice(0, 60000);
}

const EXTRACT_PROMPT = `You are the order-monitoring agent for Glow Beauty (skincare + hair tools).
Read the FULL email thread below against the CURRENT RECORD and report the latest truth.

Rules:
- updates: fill a field ONLY when the thread clearly states a NEW value that differs from the current record. Omit everything else. Dates must be ISO YYYY-MM-DD; resolve phrases like "end of July" to a concrete date (use the 25th for "end of", the 5th for "early", the 15th for "mid").
- stage / po_status: only advance based on explicit statements ("production finished", "shipped today", "arrived at warehouse").
- risky_changes: quantity reductions, cancellations, price increases, split shipments, or anything a human must sign off on. NEVER put these in updates.
- missing: what we still don't know and need from the counterparty (no ETA, unconfirmed deposit, no tracking, unanswered question). Empty if we have everything.
- open_questions: questions raised in the thread (either side) that no later message answers.
- confidence "high" only when the newest messages are unambiguous about the updates you filled.`;

export async function runExtraction(
  entity: EntityState,
  messages: ThreadMessage[],
  today: string,
): Promise<Extraction> {
  const prompt = `${EXTRACT_PROMPT}

Today's date: ${today}

CURRENT RECORD:
${describeRecord(entity)}

EMAIL THREAD (oldest → newest):
${formatThread(messages)}`;

  // GLOW_PARSE_MODEL (Gemini), not Claude: Claude via the Gateway hangs
  // indefinitely on generateObject schemas that carry regex `pattern`
  // constraints (verified July 2026), and the ISO-date regexes here are what
  // keep extracted dates machine-readable. Gemini handles them in ~6s.
  const { object } = await withModelFallback(GLOW_PARSE_MODEL, (model) =>
    generateObject({ model, schema: extractionSchema, prompt }),
  );
  return object;
}

// ---------------------------------------------------------------------------
// Safe auto-apply

const PO_STATUS_ORDER: PoStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "in_fulfillment",
  "shipped",
  "partially_received",
  "received",
  "closed",
];

function stageForward(current: ManufacturingStage, next: ManufacturingStage): boolean {
  return MANUFACTURING_STAGES.indexOf(next) > MANUFACTURING_STAGES.indexOf(current);
}

function poStatusForward(current: PoStatus, next: PoStatus): boolean {
  return PO_STATUS_ORDER.indexOf(next) > PO_STATUS_ORDER.indexOf(current);
}

export type ApplyResult = {
  applied: string[];
  needsReview: string[];
};

/**
 * Apply the high-confidence, safe subset of an extraction to the record via
 * the existing core functions. Aggressive on dates/stage/tracking (reversible,
 * forward-only), conservative on money and quantity (never auto-applied).
 * Idempotent: fields already at the extracted value are skipped, and no note
 * is appended when nothing changed.
 */
export async function applySafeUpdates(
  supabase: Client,
  entity: EntityState,
  extraction: Extraction,
  provenance: string,
  opts: { force?: boolean } = {},
): Promise<ApplyResult> {
  const u = extraction.updates;
  const applied: string[] = [];
  const needsReview: string[] = [...extraction.risky_changes];

  if (u.quantity != null) needsReview.push(`Quantity change → ${u.quantity}`);
  if (u.unit_price_usd != null) {
    needsReview.push(`Unit price change → $${u.unit_price_usd}`);
  }

  // force = a human clicked Apply in the Correspondence UI — their sign-off
  // replaces the confidence gate (but money/quantity still stay manual).
  const confident = opts.force || extraction.confidence === "high";
  if (!confident) {
    const proposed = Object.entries(u)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k} → ${v}`);
    return { applied, needsReview: [...needsReview, ...proposed] };
  }

  if (entity.type === "manufacturing_run") {
    const r = entity.record;
    const dates: Parameters<typeof updateRunDatesCore>[3] = {};
    for (const key of [
      "expected_completion_date",
      "expected_arrival_date",
      "actual_completion_date",
      "actual_arrival_date",
    ] as const) {
      const next = u[key];
      if (next && next !== r[key]) {
        dates[key] = next;
        applied.push(`${key.replace(/_/g, " ")} → ${next}`);
      }
    }
    if (Object.keys(dates).length > 0) {
      const res = await updateRunDatesCore(supabase, null, entity.id, dates);
      if (!res.ok) throw new Error(res.error.message);
    }

    if (u.stage && u.stage !== r.stage && stageForward(r.stage, u.stage)) {
      const res = await updateRunStageCore(supabase, null, entity.id, u.stage);
      if (!res.ok) throw new Error(res.error.message);
      applied.push(`stage → ${u.stage}`);
    } else if (u.stage && u.stage !== r.stage) {
      needsReview.push(`Stage would move backwards (${r.stage} → ${u.stage})`);
    }

    if (u.payment_status) applied.push(`payment: ${u.payment_status}`);
    if (u.tracking_number) applied.push(`tracking: ${u.tracking_number}`);

    if (applied.length > 0) {
      const note = `${provenance} — ${applied.join("; ")}`;
      const res = await appendRunNotesCore(supabase, null, entity.id, note);
      if (!res.ok) throw new Error(res.error.message);
    }
    return { applied, needsReview };
  }

  // Wholesale PO
  const r = entity.record;
  const details: Parameters<typeof updatePoDetailsCore>[2] = {};
  if (u.expected_arrival_date && u.expected_arrival_date !== r.expected_date) {
    details.expected_date = u.expected_arrival_date;
    applied.push(`expected date → ${u.expected_arrival_date}`);
  }
  if (u.po_status && u.po_status !== r.status) {
    if (poStatusForward(r.status, u.po_status)) {
      details.status = u.po_status;
      applied.push(`status → ${u.po_status}`);
    } else {
      needsReview.push(`Status would move backwards (${r.status} → ${u.po_status})`);
    }
  }
  if (Object.keys(details).length > 0) {
    const res = await updatePoDetailsCore(supabase, entity.id, details);
    if (!res.ok) throw new Error(res.error.message);
  }

  const shipment: Parameters<typeof updatePoShipmentCore>[2] = {};
  if (u.ship_date && u.ship_date !== r.ship_date) {
    shipment.ship_date = u.ship_date;
    applied.push(`ship date → ${u.ship_date}`);
  }
  if (u.tracking_number && u.tracking_number !== r.tracking_number) {
    shipment.tracking_number = u.tracking_number;
    applied.push(`tracking → ${u.tracking_number}`);
  }
  if (u.carrier && u.carrier !== r.carrier) {
    shipment.carrier = u.carrier;
    applied.push(`carrier → ${u.carrier}`);
  }
  if (Object.keys(shipment).length > 0) {
    const res = await updatePoShipmentCore(supabase, entity.id, shipment);
    if (!res.ok) throw new Error(res.error.message);
  }

  if (applied.length > 0) {
    const merged = r.notes?.trim()
      ? `${r.notes.trim()}\n${provenance} — ${applied.join("; ")}`
      : `${provenance} — ${applied.join("; ")}`;
    await supabase
      .from("purchase_orders")
      .update({ notes: merged })
      .eq("id", entity.id);
  }
  return { applied, needsReview };
}
