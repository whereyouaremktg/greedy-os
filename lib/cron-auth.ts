// Verifies the Authorization header on cron requests.
// Vercel automatically injects `Authorization: Bearer ${CRON_SECRET}` on cron
// invocations when CRON_SECRET is set in project env. Without the secret set,
// any cron route would be publicly hittable, so this check is mandatory.

export function verifyCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

function cronErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Cron job failed";
}

/**
 * Runs a puller and returns JSON — never an unhandled stack-trace 500.
 * On failure it posts a deduped Slack alert (best-effort) so a pipeline that
 * dies quietly — like QuickBooks losing its refresh token — surfaces the same
 * day instead of a month later. `name` is the connector label used in the
 * alert + dedupe key (e.g. "quickbooks").
 */
export async function runCronJob<T>(
  name: string,
  job: () => Promise<T>,
): Promise<Response> {
  try {
    const result = await job();
    return Response.json(result);
  } catch (err) {
    const message = cronErrorMessage(err);
    // Import lazily so cron-auth stays dependency-light for the auth-only path.
    const { alertCronFailure } = await import("@/lib/alerts");
    await alertCronFailure(name, message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
