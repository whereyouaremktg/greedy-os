import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShopifyPull } from "@/lib/pullers/shopify";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob(runShopifyPull);
}
