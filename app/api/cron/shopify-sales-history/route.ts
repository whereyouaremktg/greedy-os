import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShopifySalesHistoryPull } from "@/lib/pullers/shopify-sales-history";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob("shopify-sales-history", async () => {
    const history = await runShopifySalesHistoryPull();
    return { ok: true, history: history.rows };
  });
}
