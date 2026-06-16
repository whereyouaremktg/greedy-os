import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShipHeroInventoryPull } from "@/lib/pullers/shiphero-inventory";
import { runShipHeroInboundPull } from "@/lib/pullers/shiphero-inbound";
import { runShipHeroWholesalePull } from "@/lib/pullers/shiphero-wholesale";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob(async () => {
    const inventory = await runShipHeroInventoryPull();
    const inbound = await runShipHeroInboundPull();
    const wholesale = await runShipHeroWholesalePull();
    return {
      ok: true,
      inventory: inventory.rows,
      inbound: inbound.rows,
      wholesale: wholesale.rows,
      wholesaleClassified: wholesale.wholesale,
    };
  });
}
