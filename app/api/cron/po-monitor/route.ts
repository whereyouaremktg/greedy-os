import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { listOpenEntities, monitorEntity, type RadarLine } from "@/lib/inbound/monitor";
import {
  blocks,
  contextBlock,
  dividerBlock,
  headerBlock,
  sectionBlock,
} from "@/lib/slack/blocks";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import { sendSlack } from "@/lib/slack/dispatch";
import { createServiceClient } from "@/lib/supabase/service";

// Daily PO / manufacturing radar (14:00 UTC, after the 13:00 digest). For
// every open manufacturing run and wholesale PO: re-run the extraction agent
// over its email thread, apply safe updates, and post one 🔴/🟡/🟢 line per
// order to Slack — manufacturing first, it's the priority stream.

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function radarSection(lines: RadarLine[]): string {
  if (lines.length === 0) return "_Nothing open._";
  const order = { "🔴": 0, "🟡": 1, "🟢": 2 } as const;
  return [...lines]
    .sort((a, b) => order[a.light] - order[b.light])
    .map((l) => `${l.light} ${l.line}`)
    .join("\n");
}

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return runCronJob("po-monitor", async () => {
    const supabase = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);
    const { runs, pos } = await listOpenEntities(supabase);

    const runLines: RadarLine[] = [];
    for (const id of runs) {
      const line = await monitorEntity(supabase, "manufacturing_run", id, today);
      if (line) runLines.push(line);
    }
    const poLines: RadarLine[] = [];
    for (const id of pos) {
      const line = await monitorEntity(supabase, "purchase_order", id, today);
      if (line) poLines.push(line);
    }

    const { count: reviewCount } = await supabase
      .from("inbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review");

    const attention = [...runLines, ...poLines].filter((l) => l.light !== "🟢");
    await sendSlack({
      channel: getSlackDefaultChannel(),
      dedupeKey: `po-monitor:${today}`,
      text: `PO radar — ${attention.length} of ${runLines.length + poLines.length} orders need attention`,
      blocks: blocks(
        headerBlock("🏭 Manufacturing radar"),
        sectionBlock(radarSection(runLines)),
        dividerBlock(),
        headerBlock("🛍️ Wholesale radar"),
        sectionBlock(radarSection(poLines)),
        contextBlock(
          `${today} · ${runLines.length} runs, ${poLines.length} POs monitored` +
            (reviewCount
              ? ` · ${reviewCount} email${reviewCount === 1 ? "" : "s"} in needs-review`
              : ""),
        ),
      ),
    });

    return {
      ok: true,
      monitored: { runs: runLines.length, pos: poLines.length },
      attention: attention.length,
      needsReviewEmails: reviewCount ?? 0,
    };
  });
}
