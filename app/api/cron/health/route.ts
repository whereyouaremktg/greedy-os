import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { getConnectorHealth } from "@/lib/health/connectors";
import { alertConnectorIssue } from "@/lib/alerts";
import { createServiceClient } from "@/lib/supabase/service";

// Hourly connector watchdog. Checks every connector's freshness + (for
// QuickBooks) its OAuth token, and posts a deduped Slack alert for anything an
// operator needs to act on. This is the layer that would have caught the
// QuickBooks outage on day one instead of a month later.

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return runCronJob("health", async () => {
    const supabase = createServiceClient();
    const report = await getConnectorHealth(supabase);

    for (const c of report.problems) {
      await alertConnectorIssue({
        connector: c.connector,
        kind: c.status === "disconnected" ? "disconnected" : "stale",
        detail: c.detail,
      });
    }

    return {
      ok: report.ok,
      checkedAt: report.checkedAt,
      problems: report.problems.map((p) => ({
        connector: p.connector,
        status: p.status,
        detail: p.detail,
      })),
      connectors: report.connectors.map((c) => ({
        connector: c.connector,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
      })),
    };
  });
}
