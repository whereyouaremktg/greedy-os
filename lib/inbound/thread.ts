import type { PostmarkInbound } from "@/lib/inbound/types";

// Thread identity for inbound email. Email clients thread via RFC 5322
// Message-ID / In-Reply-To / References. Postmark's top-level MessageID is its
// own internal id — the RFC Message-ID (what replies point at) lives in
// payload.Headers, so we key rows on the RFC id when present.

function headerValue(payload: PostmarkInbound, name: string): string | null {
  const hit = (payload.Headers ?? []).find(
    (h) => (h.Name ?? "").toLowerCase() === name.toLowerCase(),
  );
  return hit?.Value?.trim() || null;
}

/** All <message-id> tokens in a References/In-Reply-To header value. */
function messageIdTokens(value: string | null): string[] {
  return value?.match(/<[^<>\s]+>/g) ?? [];
}

export function extractThreadHeaders(payload: PostmarkInbound): {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
} {
  return {
    messageId: messageIdTokens(headerValue(payload, "Message-ID"))[0] ?? null,
    inReplyTo: headerValue(payload, "In-Reply-To"),
    references: headerValue(payload, "References"),
  };
}

/**
 * The RFC Message-ID of the thread's root message: first References token,
 * else In-Reply-To (first reply). Null on a thread-starting message.
 */
export function threadRootMessageId(payload: PostmarkInbound): string | null {
  const { inReplyTo, references } = extractThreadHeaders(payload);
  return messageIdTokens(references)[0] ?? messageIdTokens(inReplyTo)[0] ?? null;
}

/** "Re: Fwd: RE: Glow PO 123" → "glow po 123" */
export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "")
    .replace(/^(\s*(re|fwd?|aw|tr)\s*(\[\d+\])?\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function senderDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/**
 * Fallback thread key when no stored message matches the References chain:
 * normalized subject + counterparty domain, so a forwarded thread whose
 * headers a forwarder stripped still groups with its follow-ups.
 */
export function subjectThreadKey(
  payload: PostmarkInbound,
  fromEmail: string,
): string {
  const subject = normalizeSubject(payload.Subject);
  if (subject) return `subj:${subject}:${senderDomain(fromEmail)}`;
  const { messageId } = extractThreadHeaders(payload);
  // No headers, no subject — the message threads only with itself.
  return `mid:${messageId ?? payload.MessageID ?? "unknown"}`;
}
