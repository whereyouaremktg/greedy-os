import { waitUntil } from "@vercel/functions";

import { createPurchaseOrderCore } from "@/lib/purchase-orders/core";
import {
  parsePurchaseOrderDocument,
  parsePurchaseOrderText,
} from "@/lib/purchase-orders/parse";
import { parsedToCreateInput } from "@/lib/purchase-orders/schema";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import {
  actionsBlock,
  blocks,
  headerBlock,
  linkButton,
  sectionBlock,
} from "@/lib/slack/blocks";
import { sendSlack } from "@/lib/slack/dispatch";
import { glowUrl } from "@/lib/slack/messages";
import { formatUsd } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Allowlist entries are either an exact address or a "@domain" suffix.
const DEFAULT_ALLOWED = ["@glowbeautyhair.com"];

function senderAllowed(sender: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.some((entry) =>
    entry.startsWith("@") ? sender.endsWith(entry) : sender === entry,
  );
}

type PostmarkAttachment = {
  Name?: string;
  Content?: string;
  ContentType?: string;
};

type PostmarkInbound = {
  MessageID?: string;
  From?: string;
  FromFull?: { Email?: string; Name?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: PostmarkAttachment[];
};

type ServiceClient = ReturnType<typeof createServiceClient>;

function htmlToText(html: string): string {
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

async function postOkSlack(created: {
  id: string;
  po_number: string | null;
  vendor_name: string;
  total: number;
  line_item_count: number;
  total_units: number;
}) {
  const label = created.po_number ? `PO ${created.po_number}` : "Purchase order";
  await sendSlack({
    channel: getSlackDefaultChannel(),
    dedupeKey: `inbound-po:${created.id}`,
    text: `New PO from forwarded email — ${created.vendor_name} · ${label} · ${created.total_units.toLocaleString()} units`,
    blocks: blocks(
      headerBlock("📨 New PO from forwarded email"),
      sectionBlock(
        `*${created.vendor_name}* · ${label}\n${created.line_item_count} styles · ${created.total_units.toLocaleString()} units · ${formatUsd(created.total, 2)}\n_Review and confirm the details + pricing._`,
      ),
      actionsBlock([linkButton("Review PO", glowUrl("/purchase-orders"))]),
    ),
  });
}

async function postFailSlack(subject: string | undefined, error: string) {
  await sendSlack({
    channel: getSlackDefaultChannel(),
    dedupeKey: `inbound-po-fail:${subject ?? ""}:${error.slice(0, 40)}`,
    text: `Couldn't read a forwarded PO email: ${error}`,
    blocks: blocks(
      sectionBlock(
        `⚠️ Couldn't auto-create a PO from a forwarded email${
          subject ? ` (“${subject}”)` : ""
        }.\n${error}\nForward it again or upload it manually.`,
      ),
    ),
  });
}

async function processInboundPo(
  supabase: ServiceClient,
  messageId: string,
  payload: PostmarkInbound,
) {
  try {
    const att = (payload.Attachments ?? []).find((a) => {
      const ct = (a.ContentType ?? "").toLowerCase();
      return ct.includes("pdf") || ct.startsWith("image/");
    });

    const parsed = await (async () => {
      if (att?.Content) {
        const ct = (att.ContentType ?? "").toLowerCase();
        const kind = ct.includes("pdf") ? "pdf" : "image";
        const mediaType = ct.includes("pdf") ? "application/pdf" : ct;
        const res = await parsePurchaseOrderDocument(
          Buffer.from(att.Content, "base64"),
          mediaType,
          kind,
        );
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
      const body =
        payload.TextBody && payload.TextBody.trim()
          ? payload.TextBody
          : htmlToText(payload.HtmlBody ?? "");
      if (!body.trim()) throw new Error("No PDF attachment and an empty body.");
      const subjectLine = payload.Subject ? `Subject: ${payload.Subject}\n\n` : "";
      const res = await parsePurchaseOrderText(subjectLine + body);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    })();

    const created = await createPurchaseOrderCore(
      supabase,
      null,
      parsedToCreateInput(parsed),
    );
    if (!created.ok) throw new Error(created.error.message);

    await supabase
      .from("inbound_email_log")
      .update({ status: "created", po_id: created.data.id })
      .eq("message_id", messageId);

    await postOkSlack(created.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("inbound_email_log")
      .update({ status: "failed", error: message })
      .eq("message_id", messageId);
    try {
      await postFailSlack(payload.Subject, message);
    } catch (slackErr) {
      console.error("[inbound/po-email] slack post failed", slackErr);
    }
  }
}

export async function POST(request: Request) {
  // Auth: a shared secret in the webhook URL (?token=…). Postmark inbound
  // doesn't sign payloads, so the unguessable URL token is the gate.
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

  const messageId = payload.MessageID?.trim();
  if (!messageId) {
    return Response.json({ ok: true, skipped: "no message id" });
  }

  const sender = (payload.FromFull?.Email ?? payload.From ?? "")
    .toLowerCase()
    .trim();

  const supabase = createServiceClient();

  // Log/claim every delivery first (idempotency + an audit trail we can inspect
  // even when a message is later rejected). 23505 = a webhook retry.
  const { error: claimError } = await supabase
    .from("inbound_email_log")
    .insert({
      message_id: messageId,
      sender,
      subject: payload.Subject ?? null,
      status: "received",
    });
  if (claimError) {
    if (claimError.code === "23505") {
      return Response.json({ ok: true, duplicate: true });
    }
    return Response.json(
      { ok: false, error: claimError.message },
      { status: 500 },
    );
  }

  // Only the team can create POs by email.
  const allowed = (
    process.env.INBOUND_EMAIL_ALLOWED_SENDERS ?? DEFAULT_ALLOWED.join(",")
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!senderAllowed(sender, allowed)) {
    await supabase
      .from("inbound_email_log")
      .update({ status: "ignored_sender" })
      .eq("message_id", messageId);
    // Ack (200) so Postmark won't retry a permanently-ignored message.
    return Response.json({ ok: true, ignored: "sender not allowed", sender });
  }

  // ACK fast; parse + create in the background so Postmark doesn't time out.
  waitUntil(processInboundPo(supabase, messageId, payload));
  return Response.json({ ok: true, queued: true });
}
