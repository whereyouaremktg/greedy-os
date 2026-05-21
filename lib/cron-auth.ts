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
