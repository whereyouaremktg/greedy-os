import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShopifyOrdersSync } from "@/lib/pullers/shopify-orders";

export const runtime = "nodejs";
// Incremental after the first pass; the budget below leaves headroom for the
// response + run bookkeeping inside the 300s function limit.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob("targets-sync", () =>
    runShopifyOrdersSync({ budgetMs: 240_000, trigger: "cron" }),
  );
}
