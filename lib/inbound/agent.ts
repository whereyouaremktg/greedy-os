import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_MODEL } from "@/lib/ai/model";
import type { EntityState, ThreadMessage } from "@/lib/inbound/extract";
import {
  appendRunNotesCore,
  updateRunDatesCore,
  updateRunStageCore,
} from "@/lib/manufacturing/core";
import {
  MANUFACTURING_STAGES,
  type ManufacturingStage,
} from "@/lib/manufacturing/stages";
import {
  updatePoDetailsCore,
  updatePoShipmentCore,
} from "@/lib/purchase-orders/core";
import type { PoStatus } from "@/lib/purchase-orders/statuses";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

// The inbound supply-chain agent: reads a vendor/buyer email thread against
// the linked record and operates Glow OS through the SAME core functions the
// team uses — advancing stages, setting dates, recording payments, updating
// tracking. Guardrails live in the tool implementations (forward-only moves,
// no quantity/price writes), so the model physically cannot overstep; risky
// changes route through flag_for_review instead.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Keep tool input schemas regex-free: Claude via the AI Gateway hangs on
// JSON-schema `pattern` constraints — dates are validated here in code.
function badDate(value: string | undefined): string | null {
  if (value != null && !ISO_DATE.test(value)) {
    return `Invalid date "${value}" — use YYYY-MM-DD.`;
  }
  return null;
}

export type AgentOutcome = {
  summary: string;
  missing: string[];
  open_questions: string[];
  /** Human-readable log of every change the agent made. */
  applied: string[];
  /** Risky/blocked changes routed to a human. */
  needs_review: string[];
  finished: boolean;
};

type PoPaymentRow = {
  id: string;
  label: Database["public"]["Enums"]["po_payment_label"];
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_date: string | null;
};

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

const SYSTEM_GLOSSARY = `You are Glow OS's supply-chain assistant — effectively a Glow Beauty ops
employee who reads vendor/buyer email threads and keeps the system of record
current. You speak the system's language:

MANUFACTURING RUNS (factory orders WE place, e.g. Shenzhen brush/bag factories)
Stages, strictly in order: ordered → in_production → complete → in_transit → received.
- ordered: PI issued; deposit usually due now. Deposit paid alone does NOT advance the stage.
- in_production: factory confirmed production started.
- complete: production finished, awaiting shipment; balance payment usually due now.
- in_transit: shipped (sea or air). Factory tracking/BL numbers go in notes.
- received: arrived at our warehouse. (Moving to complete/received auto-stamps actual dates.)
Dates: expected_completion_date (production done), expected_arrival_date (at our
warehouse), actual_* (stamped when known). Resolve fuzzy dates: "early Aug" → the 5th,
"mid Aug" → the 15th, "end of Aug" → the 25th.
Payments on runs are tracked in notes (append_note), e.g. "Deposit $3,027.50 paid 2026-07-02".

WHOLESALE PURCHASE ORDERS (retail buyers purchasing FROM us: REVOLVE, Anthropologie, JillyBox)
Statuses, strictly in order: draft → sent → confirmed → in_fulfillment → shipped →
partially_received → received → closed. UI labels: sent/in_fulfillment show as
"In fulfillment", received shows as "Delivered", closed means "PAID" (final).
Fields: expected_date (= cancel date — miss it and the buyer can cancel),
ship_date / tracking_number / carrier via update_shipment.
Payments are ledger rows (deposit / balance / other) — when the thread confirms a
payment landed, use record_payment. When ALL payments are in, set status closed.

RULES
- Act ONLY on explicit statements in the thread, weighting the NEWEST messages.
- Never repeat a change the record already reflects (tools tell you when a value
  is already set — treat that as done, not an error).
- Quantity or price changes, cancellations, order splits: NEVER apply — flag_for_review.
- Stage/status moves are forward-only; if the thread implies moving backwards,
  flag_for_review with what you saw.
- Use append_note for substantive facts with no field (payment on a run, factory
  remarks, bank/QC/sample details, tracking on a run) — short, prefixed with the date.
- If the thread asks Glow a question or is missing info we need (no ETA, no
  tracking, unanswered question), list it in finish(missing / open_questions).
- ALWAYS end by calling finish() with a 2-3 sentence status summary.`;

function describeEntity(entity: EntityState, payments: PoPaymentRow[]): string {
  if (entity.type === "manufacturing_run") {
    const r = entity.record;
    return [
      `MANUFACTURING RUN ${entity.id}`,
      `Factory: ${entity.vendorName}`,
      `Product: ${r.product_name}${r.variant ? ` (${r.variant})` : ""} × ${r.quantity}`,
      `Stage: ${r.stage}`,
      `Expected completion: ${r.expected_completion_date ?? "unknown"} · Expected arrival: ${r.expected_arrival_date ?? "unknown"}`,
      `Actual completion: ${r.actual_completion_date ?? "—"} · Actual arrival: ${r.actual_arrival_date ?? "—"}`,
      r.notes ? `Notes:\n${r.notes.slice(0, 2000)}` : "Notes: (none)",
    ].join("\n");
  }
  const r = entity.record;
  const pays =
    payments.length > 0
      ? payments
          .map(
            (p) =>
              `  - ${p.label}: $${p.amount}${p.due_date ? ` due ${p.due_date}` : ""} — ${p.paid ? `PAID${p.paid_date ? ` ${p.paid_date}` : ""}` : "unpaid"}`,
          )
          .join("\n")
      : "  (no payment rows)";
  return [
    `WHOLESALE PO ${entity.id}`,
    `Buyer: ${entity.vendorName}`,
    `PO #: ${r.po_number ?? "unknown"} · Status: ${r.status} · Total: $${r.total}`,
    `Order date: ${r.order_date ?? "unknown"} · Expected/cancel date: ${r.expected_date ?? "unknown"}`,
    `Ship date: ${r.ship_date ?? "—"} · Tracking: ${r.tracking_number ?? "—"} (${r.carrier ?? "no carrier"})`,
    `Payments:\n${pays}`,
    r.notes ? `Notes:\n${r.notes.slice(0, 2000)}` : "Notes: (none)",
  ].join("\n");
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

export async function runInboundAgent(
  supabase: Client,
  entity: EntityState,
  messages: ThreadMessage[],
  today: string,
  provenance: string,
): Promise<AgentOutcome> {
  const applied: string[] = [];
  const needsReview: string[] = [];
  let finish: Pick<AgentOutcome, "summary" | "missing" | "open_questions"> | null =
    null;

  let payments: PoPaymentRow[] = [];
  if (entity.type === "purchase_order") {
    const { data } = await supabase
      .from("po_payments")
      .select("id, label, amount, due_date, paid, paid_date")
      .eq("purchase_order_id", entity.id)
      .order("due_date", { ascending: true, nullsFirst: false });
    payments = data ?? [];
  }

  const appendNote = async (note: string): Promise<string> => {
    const line = `${provenance} — ${note.trim()}`;
    if (entity.type === "manufacturing_run") {
      const res = await appendRunNotesCore(supabase, null, entity.id, line);
      if (!res.ok) return `Failed: ${res.error.message}`;
    } else {
      const { data: row } = await supabase
        .from("purchase_orders")
        .select("notes")
        .eq("id", entity.id)
        .maybeSingle();
      const merged = row?.notes?.trim() ? `${row.notes.trim()}\n${line}` : line;
      const { error } = await supabase
        .from("purchase_orders")
        .update({ notes: merged })
        .eq("id", entity.id);
      if (error) return `Failed: ${error.message}`;
    }
    applied.push(`note: ${note.trim().slice(0, 120)}`);
    return "Note appended.";
  };

  const runTools = {
    update_dates: tool({
      description:
        "Set expected/actual completion or arrival dates on the manufacturing run (YYYY-MM-DD). Only pass fields that changed.",
      inputSchema: z.object({
        expected_completion_date: z.string().optional(),
        expected_arrival_date: z.string().optional(),
        actual_completion_date: z.string().optional(),
        actual_arrival_date: z.string().optional(),
      }),
      execute: async (input) => {
        if (entity.type !== "manufacturing_run") return "Wrong entity type.";
        const patch: Parameters<typeof updateRunDatesCore>[3] = {};
        const changes: string[] = [];
        for (const key of [
          "expected_completion_date",
          "expected_arrival_date",
          "actual_completion_date",
          "actual_arrival_date",
        ] as const) {
          const next = input[key];
          if (next == null) continue;
          const err = badDate(next);
          if (err) return err;
          if (entity.record[key] === next) {
            changes.push(`${key} already ${next} (skipped)`);
            continue;
          }
          patch[key] = next;
          changes.push(`${key} → ${next}`);
        }
        if (Object.keys(patch).length === 0) {
          return changes.length
            ? `No-op: ${changes.join("; ")}`
            : "Nothing to change.";
        }
        const res = await updateRunDatesCore(supabase, null, entity.id, patch);
        if (!res.ok) return `Failed: ${res.error.message}`;
        for (const [k, v] of Object.entries(patch)) {
          entity.record[k as keyof typeof patch] = v ?? null;
          applied.push(`${k.replace(/_/g, " ")} → ${v}`);
        }
        return `Updated: ${changes.join("; ")}`;
      },
    }),
    advance_stage: tool({
      description:
        "Advance the manufacturing run's stage (forward-only: ordered → in_production → complete → in_transit → received). Cite the email evidence in `reason`.",
      inputSchema: z.object({
        stage: z.enum([
          "ordered",
          "in_production",
          "complete",
          "in_transit",
          "received",
        ]),
        reason: z.string(),
      }),
      execute: async ({ stage, reason }) => {
        if (entity.type !== "manufacturing_run") return "Wrong entity type.";
        const current = entity.record.stage as ManufacturingStage;
        if (stage === current) return `Stage is already ${stage} (no-op).`;
        if (
          MANUFACTURING_STAGES.indexOf(stage) <
          MANUFACTURING_STAGES.indexOf(current)
        ) {
          needsReview.push(
            `Stage would move backwards (${current} → ${stage}): ${reason}`,
          );
          return `Blocked: backwards move ${current} → ${stage}. Flagged for review.`;
        }
        const res = await updateRunStageCore(supabase, null, entity.id, stage);
        if (!res.ok) return `Failed: ${res.error.message}`;
        entity.record.stage = stage;
        applied.push(`stage → ${stage} (${reason.slice(0, 80)})`);
        return `Stage advanced to ${stage}.`;
      },
    }),
  };

  const poTools = {
    set_status: tool({
      description:
        "Advance the PO status (forward-only: sent → confirmed → in_fulfillment → shipped → partially_received → received → closed). closed = fully PAID. Cite the email evidence in `reason`.",
      inputSchema: z.object({
        status: z.enum([
          "sent",
          "confirmed",
          "in_fulfillment",
          "shipped",
          "partially_received",
          "received",
          "closed",
        ]),
        reason: z.string(),
      }),
      execute: async ({ status, reason }) => {
        if (entity.type !== "purchase_order") return "Wrong entity type.";
        const current = entity.record.status;
        if (status === current) return `Status is already ${status} (no-op).`;
        if (
          PO_STATUS_ORDER.indexOf(status) < PO_STATUS_ORDER.indexOf(current)
        ) {
          needsReview.push(
            `Status would move backwards (${current} → ${status}): ${reason}`,
          );
          return `Blocked: backwards move ${current} → ${status}. Flagged for review.`;
        }
        const res = await updatePoDetailsCore(supabase, entity.id, { status });
        if (!res.ok) return `Failed: ${res.error.message}`;
        entity.record.status = status;
        applied.push(`status → ${status} (${reason.slice(0, 80)})`);
        return `Status advanced to ${status}.`;
      },
    }),
    update_dates: tool({
      description:
        "Set the PO's expected/cancel date or order date (YYYY-MM-DD).",
      inputSchema: z.object({
        expected_date: z.string().optional(),
        order_date: z.string().optional(),
      }),
      execute: async (input) => {
        if (entity.type !== "purchase_order") return "Wrong entity type.";
        const patch: Parameters<typeof updatePoDetailsCore>[2] = {};
        const changes: string[] = [];
        for (const key of ["expected_date", "order_date"] as const) {
          const next = input[key];
          if (next == null) continue;
          const err = badDate(next);
          if (err) return err;
          if (entity.record[key] === next) {
            changes.push(`${key} already ${next} (skipped)`);
            continue;
          }
          patch[key] = next;
          changes.push(`${key} → ${next}`);
        }
        if (Object.keys(patch).length === 0) {
          return changes.length
            ? `No-op: ${changes.join("; ")}`
            : "Nothing to change.";
        }
        const res = await updatePoDetailsCore(supabase, entity.id, patch);
        if (!res.ok) return `Failed: ${res.error.message}`;
        if (patch.expected_date) entity.record.expected_date = patch.expected_date;
        if (patch.order_date) entity.record.order_date = patch.order_date;
        for (const c of changes.filter((c) => !c.includes("skipped"))) {
          applied.push(c.replace(/_/g, " "));
        }
        return `Updated: ${changes.join("; ")}`;
      },
    }),
    update_shipment: tool({
      description:
        "Set ship date (YYYY-MM-DD), tracking number, and/or carrier on the PO when the thread provides them.",
      inputSchema: z.object({
        ship_date: z.string().optional(),
        tracking_number: z.string().optional(),
        carrier: z.string().optional(),
      }),
      execute: async (input) => {
        if (entity.type !== "purchase_order") return "Wrong entity type.";
        const err = badDate(input.ship_date);
        if (err) return err;
        const patch: Parameters<typeof updatePoShipmentCore>[2] = {};
        const changes: string[] = [];
        if (input.ship_date && input.ship_date !== entity.record.ship_date) {
          patch.ship_date = input.ship_date;
          changes.push(`ship date → ${input.ship_date}`);
        }
        if (
          input.tracking_number &&
          input.tracking_number !== entity.record.tracking_number
        ) {
          patch.tracking_number = input.tracking_number;
          changes.push(`tracking → ${input.tracking_number}`);
        }
        if (input.carrier && input.carrier !== entity.record.carrier) {
          patch.carrier = input.carrier;
          changes.push(`carrier → ${input.carrier}`);
        }
        if (Object.keys(patch).length === 0) return "Nothing new to set (no-op).";
        const res = await updatePoShipmentCore(supabase, entity.id, patch);
        if (!res.ok) return `Failed: ${res.error.message}`;
        entity.record.ship_date = res.data.ship_date;
        entity.record.tracking_number = res.data.tracking_number;
        entity.record.carrier = res.data.carrier;
        applied.push(...changes);
        return `Updated: ${changes.join("; ")}`;
      },
    }),
    record_payment: tool({
      description:
        "Mark a PO payment row (deposit/balance/other) as PAID when the thread confirms the money landed. paid_date YYYY-MM-DD if stated.",
      inputSchema: z.object({
        label: z.enum(["deposit", "balance", "other"]),
        paid_date: z.string().optional(),
      }),
      execute: async ({ label, paid_date }) => {
        if (entity.type !== "purchase_order") return "Wrong entity type.";
        const err = badDate(paid_date);
        if (err) return err;
        const row = payments.find((p) => p.label === label && !p.paid);
        if (!row) {
          const already = payments.find((p) => p.label === label && p.paid);
          if (already) return `The ${label} payment is already marked paid (no-op).`;
          return `No ${label} payment row exists on this PO — append a note with the payment details instead.`;
        }
        const { error } = await supabase
          .from("po_payments")
          .update({ paid: true, paid_date: paid_date ?? today })
          .eq("id", row.id);
        if (error) return `Failed: ${error.message}`;
        row.paid = true;
        row.paid_date = paid_date ?? today;
        applied.push(`${label} payment ($${row.amount}) marked paid`);
        return `Marked ${label} ($${row.amount}) paid${paid_date ? ` on ${paid_date}` : ""}.`;
      },
    }),
  };

  const sharedTools = {
    append_note: tool({
      description:
        "Append a short dated note to the record for substantive facts with no dedicated field (payments on manufacturing runs, factory remarks, tracking/BL numbers on runs, QC or sample details).",
      inputSchema: z.object({ note: z.string() }),
      execute: async ({ note }) => appendNote(note),
    }),
    flag_for_review: tool({
      description:
        "Route a risky or blocked change to a human: quantity/price changes, cancellations, order splits, backwards status moves, or anything you're unsure about.",
      inputSchema: z.object({
        reason: z.string(),
        proposed_change: z.string().optional(),
      }),
      execute: async ({ reason, proposed_change }) => {
        needsReview.push(
          proposed_change ? `${reason} — proposed: ${proposed_change}` : reason,
        );
        return "Flagged for human review.";
      },
    }),
    finish: tool({
      description:
        "REQUIRED final call. Summarize the order's current state per the thread, plus what's missing from the counterparty and open questions.",
      inputSchema: z.object({
        summary: z.string(),
        missing: z.array(z.string()).default([]),
        open_questions: z.array(z.string()).default([]),
      }),
      execute: async (input) => {
        finish = input;
        return "Recorded.";
      },
    }),
  };

  const tools =
    entity.type === "manufacturing_run"
      ? { ...runTools, ...sharedTools }
      : { ...poTools, ...sharedTools };

  const prompt = `Today's date: ${today}

CURRENT RECORD:
${describeEntity(entity, payments)}

EMAIL THREAD (oldest → newest):
${formatThread(messages)}

Bring the record up to date with this thread using your tools, then call finish().`;

  const result = await withModelFallback(GLOW_MODEL, (model) =>
    generateText({
      model,
      system: SYSTEM_GLOSSARY,
      prompt,
      tools,
      stopWhen: stepCountIs(12),
    }),
  );

  // Provenance trail: one dated note listing the field changes the agent made
  // this pass (its own append_note entries already carry the prefix).
  const fieldChanges = applied.filter((a) => !a.startsWith("note: "));
  if (fieldChanges.length > 0) {
    const line = `${provenance} — ${fieldChanges.join("; ")}`;
    if (entity.type === "manufacturing_run") {
      await appendRunNotesCore(supabase, null, entity.id, line);
    } else {
      const { data: row } = await supabase
        .from("purchase_orders")
        .select("notes")
        .eq("id", entity.id)
        .maybeSingle();
      const merged = row?.notes?.trim() ? `${row.notes.trim()}\n${line}` : line;
      await supabase
        .from("purchase_orders")
        .update({ notes: merged })
        .eq("id", entity.id);
    }
  }

  const done = finish as Pick<
    AgentOutcome,
    "summary" | "missing" | "open_questions"
  > | null;
  return {
    summary:
      done?.summary ??
      result.text.trim().slice(0, 600) ??
      "Thread reviewed; no summary produced.",
    missing: done?.missing ?? [],
    open_questions: done?.open_questions ?? [],
    applied,
    needs_review: needsReview,
    finished: done != null,
  };
}
