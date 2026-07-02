"use server";

import { z } from "zod";

import {
  applySafeUpdates,
  extractionSchema,
  fetchEntityState,
  type Extraction,
} from "@/lib/inbound/extract";
import type { MatchedEntityType } from "@/lib/inbound/types";
import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";
import { createClient } from "@/lib/supabase/server";

const entityTypeSchema = z.enum(["manufacturing_run", "purchase_order"]);
const idSchema = z.string().uuid();

export type CorrespondenceMessage = {
  id: string;
  from_email: string | null;
  subject: string | null;
  snippet: string;
  received_at: string;
  status: string;
};

export type CorrespondenceData = {
  messages: CorrespondenceMessage[];
  latest: {
    messageId: string;
    summary: string;
    missing: string[];
    openQuestions: string[];
    needsReview: string[];
    /** Pending suggested updates ("field → value") not yet on the record. */
    suggested: string[];
    appliedAt: string | null;
  } | null;
};

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function parseStoredExtraction(raw: unknown): {
  extraction: Extraction | null;
  applied: string[];
  needsReview: string[];
  appliedAt: string | null;
} {
  const parsed = extractionSchema.safeParse(raw);
  const extra = (raw ?? {}) as {
    applied?: string[];
    needs_review?: string[];
    applied_at?: string;
  };
  return {
    extraction: parsed.success ? parsed.data : null,
    applied: Array.isArray(extra.applied) ? extra.applied : [],
    needsReview: Array.isArray(extra.needs_review) ? extra.needs_review : [],
    appliedAt: extra.applied_at ?? null,
  };
}

export async function getCorrespondence(
  entityType: MatchedEntityType,
  entityId: string,
): Promise<ActionResult<CorrespondenceData>> {
  const typeOk = entityTypeSchema.safeParse(entityType);
  const idOk = idSchema.safeParse(entityId);
  if (!typeOk.success || !idOk.success) {
    return { ok: false, error: { code: "INVALID", message: "Bad entity ref" } };
  }
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } };
  }

  const { data, error } = await supabase
    .from("inbound_messages")
    .select("id, from_email, subject, text_body, received_at, status, extraction")
    .eq("matched_entity_type", entityType)
    .eq("matched_entity_id", entityId)
    .order("received_at", { ascending: false })
    .limit(25);

  if (error) {
    return { ok: false, error: { code: "DB_ERROR", message: error.message } };
  }

  const messages: CorrespondenceMessage[] = (data ?? []).map((m) => ({
    id: m.id,
    from_email: m.from_email,
    subject: m.subject,
    snippet: (m.text_body ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
    received_at: m.received_at,
    status: m.status,
  }));

  const latestWithExtraction = (data ?? []).find((m) => m.extraction != null);
  let latest: CorrespondenceData["latest"] = null;
  if (latestWithExtraction) {
    const { extraction, applied, needsReview, appliedAt } =
      parseStoredExtraction(latestWithExtraction.extraction);
    if (extraction) {
      const suggested = Object.entries(extraction.updates)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k.replace(/_/g, " ")} → ${v}`)
        .filter((s) => !applied.some((a) => a.split(" → ")[0] === s.split(" → ")[0]));
      latest = {
        messageId: latestWithExtraction.id,
        summary: extraction.summary,
        missing: extraction.missing,
        openQuestions: extraction.open_questions,
        needsReview,
        suggested,
        appliedAt,
      };
    }
  }

  return { ok: true, data: { messages, latest } };
}

/**
 * "Apply" affordance: a human signs off on the latest extraction's suggested
 * updates, so they're applied regardless of model confidence (money and
 * quantity fields still stay manual — edit those in the form).
 */
export async function applyEmailUpdates(
  messageId: string,
): Promise<ActionResult<{ applied: string[] }>> {
  const idOk = idSchema.safeParse(messageId);
  if (!idOk.success) {
    return { ok: false, error: { code: "INVALID", message: "Bad message id" } };
  }
  const { supabase, user } = await getAuthedClient();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in" } };
  }

  const { data: msg, error } = await supabase
    .from("inbound_messages")
    .select("id, subject, matched_entity_type, matched_entity_id, extraction")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !msg?.matched_entity_id || !msg.matched_entity_type) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Message or linked order not found" },
    };
  }

  const { extraction } = parseStoredExtraction(msg.extraction);
  if (!extraction) {
    return {
      ok: false,
      error: { code: "NO_EXTRACTION", message: "No extraction stored for this email" },
    };
  }

  const entity = await fetchEntityState(
    supabase,
    msg.matched_entity_type as MatchedEntityType,
    msg.matched_entity_id,
  );
  if (!entity) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Order not found" } };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { applied } = await applySafeUpdates(
      supabase,
      entity,
      extraction,
      `[applied from email ${today}] "${msg.subject ?? "(no subject)"}"`,
      { force: true },
    );

    await supabase
      .from("inbound_messages")
      .update({
        status: "applied",
        extraction: {
          ...extraction,
          applied,
          needs_review: [],
          applied_at: new Date().toISOString(),
        } as never,
      })
      .eq("id", msg.id);

    revalidateTimelinePaths();
    return { ok: true, data: { applied } };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "APPLY_FAILED",
        message: err instanceof Error ? err.message : "Failed to apply updates",
      },
    };
  }
}
