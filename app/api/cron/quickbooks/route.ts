import { verifyCronSecret } from "@/lib/cron-auth";
import { runQuickbooksPull } from "@/lib/pullers/quickbooks";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  const result = await runQuickbooksPull();
  return Response.json(result);
}
