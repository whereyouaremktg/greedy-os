import "server-only";

import { GLOW_FALLBACK_MODELS } from "@/lib/ai/model";

// Walks an AI SDK error (RetryError wraps per-attempt errors, APICallError
// carries statusCode) and flattens every nested error into one list.
function flattenErrors(err: unknown, depth = 0): unknown[] {
  if (err == null || depth > 4) return [];
  const out: unknown[] = [err];
  const e = err as {
    errors?: unknown[];
    lastError?: unknown;
    cause?: unknown;
  };
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) out.push(...flattenErrors(inner, depth + 1));
  }
  if (e.lastError) out.push(...flattenErrors(e.lastError, depth + 1));
  if (e.cause) out.push(...flattenErrors(e.cause, depth + 1));
  return out;
}

const AVAILABILITY_STATUS = new Set([402, 403, 429, 500, 502, 503, 529]);
const AVAILABILITY_PATTERN =
  /free tier|rate.?limit|quota|credit|payment|billing|overloaded|unavailable|no_providers|restrictedmodels/i;

/**
 * True when the error means "this model can't serve the request right now"
 * (Gateway billing/rate limits, provider overload) rather than a bug in our
 * request — i.e. the cases where trying a different model can still succeed.
 */
export function isModelAvailabilityError(err: unknown): boolean {
  return flattenErrors(err).some((e) => {
    const { statusCode, message, type } = e as {
      statusCode?: number;
      message?: string;
      type?: string;
    };
    if (statusCode != null && AVAILABILITY_STATUS.has(statusCode)) return true;
    if (type === "rate_limit_exceeded") return true;
    return typeof message === "string" && AVAILABILITY_PATTERN.test(message);
  });
}

/**
 * Run a generate call against `primary`, falling back through
 * GLOW_FALLBACK_MODELS when the model is rate-limited/unavailable (the Vercel
 * AI Gateway free tier 429s Claude even via BYOK — see analyst-errors.ts).
 * Non-availability errors (bad request, tool schema bugs) re-throw immediately.
 */
export async function withModelFallback<T>(
  primary: string,
  run: (model: string) => Promise<T>,
): Promise<T> {
  const chain = [
    primary,
    ...GLOW_FALLBACK_MODELS.filter((m) => m !== primary),
  ];

  let lastError: unknown;
  for (const [i, model] of chain.entries()) {
    try {
      return await run(model);
    } catch (err) {
      lastError = err;
      if (!isModelAvailabilityError(err)) throw err;
      const next = chain[i + 1];
      console.warn(
        `[ai] model "${model}" unavailable${next ? `, falling back to "${next}"` : ", no fallbacks left"}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastError;
}
