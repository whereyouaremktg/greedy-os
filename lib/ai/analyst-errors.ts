const BILLING_PATTERN =
  /free tier|rate.?limit|quota|credit|payment|billing|restrictedmodels|no_providers/i;

function collectMessages(err: unknown, depth = 0): string[] {
  if (err == null || depth > 4) return [];
  const out: string[] = [];
  const e = err as {
    message?: string;
    errors?: unknown[];
    lastError?: unknown;
    cause?: unknown;
  };
  if (typeof e.message === "string") out.push(e.message);
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) out.push(...collectMessages(inner, depth + 1));
  }
  if (e.lastError) out.push(...collectMessages(e.lastError, depth + 1));
  if (e.cause) out.push(...collectMessages(e.cause, depth + 1));
  return out;
}

export function analystErrorSlackText(err: unknown): string {
  const messages = collectMessages(err);
  const combined = messages.join(" | ");

  if (BILLING_PATTERN.test(combined)) {
    return (
      "The Vercel AI Gateway is rate-limiting Glow's models — free-tier limits " +
      "apply even with BYOK keys, and the fallback model hit them too. " +
      "Fix: add Gateway credits at vercel.com → AI → Top up. Then re-ask me here."
    );
  }

  const cause = (messages[0] ?? String(err)).slice(0, 200);
  return `I hit an issue: ${cause} — full details in the Vercel logs for /api/slack/*.`;
}
