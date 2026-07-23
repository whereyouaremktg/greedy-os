import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, parseISO } from "date-fns";

import { runInboundAgent } from "@/lib/inbound/agent";
import {
  fetchEntityState,
  fetchThreadMessages,
  type EntityState,
  type ThreadMessage,
} from "@/lib/inbound/extract";
import { formatStageLabel } from "@/lib/manufacturing/stages";
import { formatPoStatusLabel } from "@/lib/purchase-orders/statuses";
import type { MatchedEntityType } from "@/lib/inbound/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

/** No counterparty reply for this many days = stalled. */
const STALL_DAYS = 5;

export type RadarLine = {
  entityType: MatchedEntityType;
  entityId: string;
  light: "🔴" | "🟡" | "🟢";
  line: string;
  needsAttention: string[];
  /** Structured facts for the LLM briefing writer (lib/slack/briefing.ts). */
  facts: {
    vendor: string;
    item: string;
    status: string;
    eta: string | null;
    flags: string[];
    appliedToday: string[];
  };
};

function daysAgo(iso: string | null, today: string): number | null {
  if (!iso) return null;
  try {
    return differenceInCalendarDays(parseISO(today), parseISO(iso));
  } catch {
    return null;
  }
}

function shortDate(iso: string | null): string {
  return iso ? iso.slice(5).replace("-", "/") : "no date";
}

type AgentFindings = {
  missing: string[];
  open_questions: string[];
  needs_review?: string[];
};

function assess(
  entity: EntityState,
  extraction: AgentFindings | null,
  messages: ThreadMessage[],
  applied: string[],
  today: string,
): RadarLine {
  const attention: string[] = [];
  const lastMsg = messages.at(-1)?.received_at?.slice(0, 10) ?? null;
  const sinceLast = daysAgo(lastMsg, today);

  const isManufacturing = entity.type === "manufacturing_run";
  const eta = isManufacturing
    ? entity.record.expected_arrival_date
    : entity.record.expected_date;
  const etaDays = daysAgo(eta, today);
  const overdue = eta != null && etaDays != null && etaDays > 0;

  const stalled =
    messages.length > 0 && sinceLast != null && sinceLast >= STALL_DAYS;
  const silent = messages.length === 0;

  if (!eta) attention.push("no ETA on record");
  if (overdue) attention.push(`ETA ${shortDate(eta)} passed`);
  if (stalled) attention.push(`no reply in ${sinceLast}d`);
  if (silent) attention.push("no correspondence yet");
  for (const m of extraction?.missing ?? []) attention.push(m);
  for (const q of extraction?.open_questions ?? []) attention.push(q);
  for (const f of extraction?.needs_review ?? []) attention.push(f);

  const light: RadarLine["light"] =
    overdue || (stalled && !eta)
      ? "🔴"
      : attention.length > 0
        ? "🟡"
        : "🟢";

  const stateLabel = isManufacturing
    ? formatStageLabel(entity.record.stage)
    : formatPoStatusLabel(entity.record.status);
  const name = isManufacturing
    ? `*${entity.vendorName}* — ${entity.record.product_name} ×${entity.record.quantity.toLocaleString()}`
    : `*${entity.vendorName}* — PO ${entity.record.po_number ?? "?"}`;

  const parts = [
    `${name} · ${stateLabel} · ETA ${shortDate(eta)}`,
    applied.length > 0 ? `today: ${applied.join(", ")}` : null,
    attention.length > 0 ? `⚠︎ ${attention.slice(0, 3).join("; ")}` : null,
  ].filter(Boolean);

  return {
    entityType: isManufacturing ? "manufacturing_run" : "purchase_order",
    entityId: entity.id,
    light,
    line: parts.join(" — "),
    needsAttention: attention,
    facts: {
      vendor: entity.vendorName,
      item: isManufacturing
        ? `${entity.record.product_name} ×${entity.record.quantity.toLocaleString()}`
        : entity.record.po_number
          ? `PO ${entity.record.po_number}`
          : `unnumbered PO from ${entity.record.order_date ?? "unknown date"}`,
      status: stateLabel,
      eta,
      flags: attention,
      appliedToday: applied,
    },
  };
}

/**
 * One monitored entity: gather its thread, re-run the extraction agent
 * against the CURRENT record (so "missing"/"open questions" stay fresh),
 * apply safe updates, and produce its radar line. The apply path is
 * idempotent — values already on the record are skipped, so the daily pass
 * doesn't duplicate what the per-message pass already did.
 */
export async function monitorEntity(
  supabase: Client,
  entityType: MatchedEntityType,
  entityId: string,
  today: string,
): Promise<RadarLine | null> {
  const entity = await fetchEntityState(supabase, entityType, entityId);
  if (!entity) return null;
  const messages = await fetchThreadMessages(supabase, entityType, entityId);

  let findings: AgentFindings | null = null;
  let applied: string[] = [];
  if (messages.length > 0) {
    try {
      const outcome = await runInboundAgent(
        supabase,
        entity,
        messages,
        today,
        `[radar ${today}]`,
      );
      findings = outcome;
      applied = outcome.applied;
      for (const flag of outcome.needs_review) {
        console.warn("[po-monitor] needs review:", entityType, entityId, flag);
      }
    } catch (err) {
      console.error("[po-monitor] agent failed", entityType, entityId, err);
    }
  }

  // Re-read after applying so the radar line reflects the updated record.
  const fresh = (await fetchEntityState(supabase, entityType, entityId)) ?? entity;
  return assess(fresh, findings, messages, applied, today);
}

export async function listOpenEntities(supabase: Client): Promise<{
  runs: string[];
  pos: string[];
}> {
  const [{ data: runs }, { data: pos }] = await Promise.all([
    supabase
      .from("manufacturing_runs")
      .select("id")
      .in("stage", ["ordered", "in_production", "complete", "in_transit"])
      .order("expected_arrival_date", { ascending: true, nullsFirst: false })
      .limit(60),
    supabase
      .from("purchase_orders")
      .select("id")
      .in("status", ["sent", "confirmed", "in_fulfillment", "shipped", "partially_received"])
      .order("expected_date", { ascending: true, nullsFirst: false })
      .limit(60),
  ]);
  return { runs: (runs ?? []).map((r) => r.id), pos: (pos ?? []).map((p) => p.id) };
}
