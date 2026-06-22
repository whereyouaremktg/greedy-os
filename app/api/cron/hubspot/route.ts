import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runHubspotPull } from "@/lib/pullers/hubspot";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob("hubspot", runHubspotPull);
}
