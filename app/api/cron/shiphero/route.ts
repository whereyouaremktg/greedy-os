import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { runShipHeroInventoryPull } from "@/lib/pullers/shiphero-inventory";
import { runShipHeroInboundPull } from "@/lib/pullers/shiphero-inbound";
import { runShipHeroWholesalePull } from "@/lib/pullers/shiphero-wholesale";

export const runtime = "nodejs";
// Three sequential paginated pulls with credit-based pacing — give it room.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  return runCronJob("shiphero", async () => {
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
