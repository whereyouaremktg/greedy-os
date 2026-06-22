import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShopifyProductSync } from "@/lib/products/shopify-sync";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob("shopify-products", async () => {
    const supabase = createServiceClient();
    return runShopifyProductSync(supabase, null);
  });
}
