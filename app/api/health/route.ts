import { verifyCronSecret } from "@/lib/cron-auth";
import { getConnectorHealth } from "@/lib/health/connectors";
import { createServiceClient } from "@/lib/supabase/service";

// Read-only connector health, gated by the same CRON_SECRET bearer the cron
// routes use. No side effects — for the daily Claude routine, uptime monitors,
// or a quick curl. Returns 503 when any connector is unhealthy so external
// monitors can alarm too.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  const supabase = createServiceClient();
  const report = await getConnectorHealth(supabase);
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
