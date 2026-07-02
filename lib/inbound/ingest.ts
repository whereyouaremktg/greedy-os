import { waitUntil } from "@vercel/functions";

import { runInboundAgent } from "@/lib/inbound/agent";
import { classifyStream } from "@/lib/inbound/classify";
import {
  fetchEntityState,
  fetchThreadMessages,
} from "@/lib/inbound/extract";
import { linkMessageToEntity } from "@/lib/inbound/link";
import {
  extractThreadHeaders,
  subjectThreadKey,
  threadRootMessageId,
} from "@/lib/inbound/thread";
import type {
  InboundStream,
  PostmarkAttachment,
  PostmarkInbound,
  StoredAttachment,
} from "@/lib/inbound/types";
import {
  blocks,
  contextBlock,
  headerBlock,
  linkButton,
  actionsBlock,
  sectionBlock,
} from "@/lib/slack/blocks";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import { sendSlack } from "@/lib/slack/dispatch";
import { glowUrl } from "@/lib/slack/messages";
import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";
import { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

// Allowlist entries are either an exact address or a "@domain" suffix. The
// monitored inboxes are CC'd on vendor threads, so vendor domains must be able
// to deliver — set INBOUND_EMAIL_ALLOWED_SENDERS="" to allow all senders, or
// list team + vendor domains explicitly.
const DEFAULT_ALLOWED = ["@glowbeautyhair.com"];

function senderAllowed(sender: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.some((entry) =>
    entry.startsWith("@") ? sender.endsWith(entry) : sender === entry,
  );
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyText(payload: PostmarkInbound): string {
  return payload.TextBody?.trim()
    ? payload.TextBody
    : htmlToText(payload.HtmlBody ?? "");
}

function isDocumentAttachment(a: PostmarkAttachment): boolean {
  const ct = (a.ContentType ?? "").toLowerCase();
  return ct.includes("pdf") || ct.startsWith("image/");
}

function primaryDocument(
  payload: PostmarkInbound,
): { buffer: Buffer; mediaType: string; kind: "pdf" | "image" } | null {
  const att = (payload.Attachments ?? []).find(
    (a) => isDocumentAttachment(a) && a.Content,
  );
  if (!att?.Content) return null;
  const ct = (att.ContentType ?? "").toLowerCase();
  return {
    buffer: Buffer.from(att.Content, "base64"),
    mediaType: ct.includes("pdf") ? "application/pdf" : ct,
    kind: ct.includes("pdf") ? "pdf" : "image",
  };
}

async function storeAttachments(
  supabase: ServiceClient,
  messageDbId: string,
  payload: PostmarkInbound,
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = [];
  for (const [i, att] of (payload.Attachments ?? []).entries()) {
    if (!isDocumentAttachment(att) || !att.Content) continue;
    const name = att.Name || `attachment-${i}`;
    const contentType = att.ContentType ?? "application/octet-stream";
    const buffer = Buffer.from(att.Content, "base64");
    const path = `${messageDbId}/${name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage
      .from("inbound-attachments")
      .upload(path, buffer, { contentType, upsert: true });
    if (error) console.error("[inbound] attachment upload failed", path, error);
    out.push({
      name,
      content_type: contentType,
      size: buffer.length,
      storage_path: error ? null : path,
    });
  }
  return out;
}

async function resolveThreadKey(
  supabase: ServiceClient,
  payload: PostmarkInbound,
  fromEmail: string,
): Promise<string> {
  // A reply names its thread root — adopt the stored root/sibling's key so
  // replies land in the same thread even when the root used a subject key.
  const rootMid = threadRootMessageId(payload);
  if (rootMid) {
    const { data } = await supabase
      .from("inbound_messages")
      .select("thread_key")
      .eq("message_id", rootMid)
      .limit(1)
      .maybeSingle();
    if (data) return data.thread_key;
  }
  const subjectKey = subjectThreadKey(payload, fromEmail);
  const { data: bySubject } = await supabase
    .from("inbound_messages")
    .select("thread_key")
    .eq("thread_key", subjectKey)
    .limit(1)
    .maybeSingle();
  if (bySubject) return subjectKey;
  return rootMid ? `mid:${rootMid}` : subjectKey;
}

function entityUrl(entityType: string): string {
  return glowUrl(
    entityType === "manufacturing_run" ? "/manufacturing" : "/purchase-orders",
  );
}

async function notifyApplied(input: {
  stream: InboundStream;
  entityType: string;
  entityLabel: string;
  messageDbId: string;
  subject: string | null;
  applied: string[];
  needsReview: string[];
  summary: string;
}) {
  const icon = input.stream === "manufacturing" ? "🏭" : "🛍️";
  const changes =
    input.applied.length > 0
      ? `*Applied:* ${input.applied.join(" · ")}`
      : "_No record changes — thread stored for the daily radar._";
  const review =
    input.needsReview.length > 0
      ? `\n⚠️ *Needs review:* ${input.needsReview.join(" · ")}`
      : "";
  await sendSlack({
    channel: getSlackDefaultChannel(),
    dedupeKey: `inbound-msg:${input.messageDbId}`,
    text: `${icon} Email update — ${input.entityLabel}`,
    blocks: blocks(
      sectionBlock(
        `${icon} *${input.entityLabel}* — email update\n${input.summary}\n${changes}${review}`,
      ),
      contextBlock(`From thread: “${input.subject ?? "(no subject)"}”`),
      actionsBlock([linkButton("Open", entityUrl(input.entityType))]),
    ),
  });
}

async function notifyNeedsReview(input: {
  stream: InboundStream;
  messageDbId: string;
  subject: string | null;
  fromEmail: string;
  reason: string;
}) {
  await sendSlack({
    channel: getSlackDefaultChannel(),
    dedupeKey: `inbound-review:${input.messageDbId}`,
    text: `Inbound ${input.stream} email needs review: ${input.subject ?? "(no subject)"}`,
    blocks: blocks(
      headerBlock("📨 Inbound email needs review"),
      sectionBlock(
        `Couldn't confidently link a *${input.stream}* email.\n*From:* ${input.fromEmail}\n*Subject:* ${input.subject ?? "(no subject)"}\n*Why:* ${input.reason}`,
      ),
    ),
  });
}

async function processInboundMessage(
  supabase: ServiceClient,
  messageDbId: string,
  defaultStream: InboundStream,
  payload: PostmarkInbound,
  fromEmail: string,
) {
  const setStatus = (
    patch: Partial<{
      status: string;
      error: string | null;
      stream: string;
      matched_entity_type: string | null;
      matched_entity_id: string | null;
      extraction: unknown;
      processed_at: string;
    }>,
  ) =>
    supabase
      .from("inbound_messages")
      .update({ processed_at: new Date().toISOString(), ...patch } as never)
      .eq("id", messageDbId);

  try {
    const attachments = await storeAttachments(supabase, messageDbId, payload);
    if (attachments.length > 0) {
      await supabase
        .from("inbound_messages")
        .update({ attachments: attachments as never })
        .eq("id", messageDbId);
    }

    const body = bodyText(payload);
    const stream = await classifyStream(supabase, {
      fromEmail,
      subject: payload.Subject ?? null,
      body,
      defaultStream,
    });
    if (stream !== defaultStream) {
      await supabase
        .from("inbound_messages")
        .update({ stream })
        .eq("id", messageDbId);
    }

    const threadKey = await resolveThreadKey(supabase, payload, fromEmail);
    await supabase
      .from("inbound_messages")
      .update({ thread_key: threadKey })
      .eq("id", messageDbId);

    const linked = await linkMessageToEntity(supabase, {
      messageDbId,
      threadKey,
      stream,
      fromEmail,
      subject: payload.Subject ?? null,
      bodyText: body,
      attachment: primaryDocument(payload),
    });

    if (!linked.ok) {
      await setStatus({ status: "needs_review", error: linked.reason });
      try {
        await notifyNeedsReview({
          stream,
          messageDbId,
          subject: payload.Subject ?? null,
          fromEmail,
          reason: linked.reason,
        });
      } catch (slackErr) {
        console.error("[inbound] slack post failed", slackErr);
      }
      return;
    }

    await setStatus({
      status: "linked",
      matched_entity_type: linked.entityType,
      matched_entity_id: linked.entityId,
    });

    const entity = await fetchEntityState(supabase, linked.entityType, linked.entityId);
    if (!entity) throw new Error("Linked entity vanished before extraction");
    const messages = await fetchThreadMessages(
      supabase,
      linked.entityType,
      linked.entityId,
    );

    const today = new Date().toISOString().slice(0, 10);
    const provenance = `[email ${today}] "${payload.Subject ?? "(no subject)"}"`;
    const outcome = await runInboundAgent(
      supabase,
      entity,
      messages,
      today,
      provenance,
    );
    const { applied, needs_review: needsReview } = outcome;

    await setStatus({
      status: needsReview.length > 0 ? "needs_review" : "applied",
      extraction: {
        ...outcome,
        applied_at: new Date().toISOString(),
      } as never,
    });

    revalidateTimelinePaths();

    const entityLabel =
      entity.type === "manufacturing_run"
        ? `${entity.vendorName} — ${entity.record.product_name}`
        : `${entity.vendorName} — PO ${entity.record.po_number ?? "?"}`;
    // Best-effort: a Slack hiccup must not mark an applied message as failed.
    try {
      await notifyApplied({
        stream,
        entityType: linked.entityType,
        entityLabel: linked.created ? `${entityLabel} (created)` : entityLabel,
        messageDbId,
        subject: payload.Subject ?? null,
        applied,
        needsReview,
        summary: outcome.summary,
      });
    } catch (slackErr) {
      console.error("[inbound] slack post failed", slackErr);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[inbound] processing failed", messageDbId, err);
    await setStatus({ status: "failed", error: message });
    try {
      await notifyNeedsReview({
        stream: defaultStream,
        messageDbId,
        subject: payload.Subject ?? null,
        fromEmail,
        reason: `Processing failed: ${message}`,
      });
    } catch (slackErr) {
      console.error("[inbound] slack post failed", slackErr);
    }
  }
}

/**
 * Shared Postmark inbound webhook handler for both streams. Auths via the
 * ?token= URL secret, dedupes on the RFC Message-ID, stores the message +
 * attachments, then links/extracts/applies in the background (fast ACK so
 * Postmark doesn't time out).
 */
export async function handleInboundEmail(
  request: Request,
  defaultStream: InboundStream,
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || token !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: PostmarkInbound;
  try {
    payload = (await request.json()) as PostmarkInbound;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Key on the RFC Message-ID (what replies reference); Postmark's internal
  // MessageID is the fallback. Either is stable across webhook retries.
  const headers = extractThreadHeaders(payload);
  const messageId = headers.messageId ?? payload.MessageID?.trim();
  if (!messageId) {
    return Response.json({ ok: true, skipped: "no message id" });
  }

  const fromEmail = (payload.FromFull?.Email ?? payload.From ?? "")
    .toLowerCase()
    .trim();

  const supabase = createServiceClient();

  // Claim the message first (idempotency + audit). 23505 = webhook retry.
  const { data: claimed, error: claimError } = await supabase
    .from("inbound_messages")
    .insert({
      stream: defaultStream,
      message_id: messageId,
      thread_key: subjectThreadKey(payload, fromEmail),
      in_reply_to: headers.inReplyTo,
      references: headers.references,
      from_email: fromEmail,
      subject: payload.Subject ?? null,
      text_body: payload.TextBody ?? null,
      html_body: payload.HtmlBody ?? null,
      status: "received",
    })
    .select("id")
    .single();

  if (claimError || !claimed) {
    if (claimError?.code === "23505") {
      return Response.json({ ok: true, duplicate: true });
    }
    return Response.json(
      { ok: false, error: claimError?.message ?? "claim failed" },
      { status: 500 },
    );
  }

  const allowed = (
    process.env.INBOUND_EMAIL_ALLOWED_SENDERS ?? DEFAULT_ALLOWED.join(",")
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!senderAllowed(fromEmail, allowed)) {
    await supabase
      .from("inbound_messages")
      .update({ status: "ignored", error: "sender not allowed" })
      .eq("id", claimed.id);
    // Ack (200) so Postmark won't retry a permanently-ignored message.
    return Response.json({ ok: true, ignored: "sender not allowed", fromEmail });
  }

  waitUntil(
    processInboundMessage(supabase, claimed.id, defaultStream, payload, fromEmail),
  );
  return Response.json({ ok: true, queued: true });
}
