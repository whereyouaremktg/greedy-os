import { format } from "date-fns";

import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { listOpenEntities, monitorEntity, type RadarLine } from "@/lib/inbound/monitor";
import {
  blocks,
  contextBlock,
  dividerBlock,
  headerBlock,
  sectionBlock,
} from "@/lib/slack/blocks";
import {
  briefingBlocks,
  composeBriefing,
  type BriefingData,
} from "@/lib/slack/briefing";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import { sendSlack } from "@/lib/slack/dispatch";
import { createServiceClient } from "@/lib/supabase/service";

// Daily PO / manufacturing radar (14:00 UTC, after the 13:00 digest). For
// every open manufacturing run and wholesale PO: re-run the extraction agent
// over its email thread, apply safe updates, then have the briefing writer
// (lib/slack/briefing.ts) turn the radar into one chief-of-staff-style Slack
// post. If the model is unavailable, fall back to the deterministic
// 🔴/🟡/🟢 block layout — the daily brief must never silently not arrive.
//
// `?dry=1` composes and RETURNS the briefing without posting to Slack — for
// iterating on the prompt against real data.

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

function legacyBlocks(
  runLines: RadarLine[],
  poLines: RadarLine[],
  footer: string,
) {
  return blocks(
    headerBlock("🏭 Manufacturing radar"),
    sectionBlock(radarSection(runLines)),
    dividerBlock(),
    headerBlock("🛍️ Wholesale radar"),
    sectionBlock(radarSection(poLines)),
    contextBlock(footer),
  );
}

function toBriefingRow(l: RadarLine): BriefingData["runs"][number] {
  return { kind: l.entityType, dot: l.light, ...l.facts };
}

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  return runCronJob("po-monitor", async () => {
    const supabase = createServiceClient();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
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

    const [{ count: reviewCount }, { data: salesRow }, { data: cashRow }] =
      await Promise.all([
        supabase
          .from("inbound_messages")
          .select("id", { count: "exact", head: true })
          .eq("status", "needs_review"),
        supabase
          .from("shopify_metrics")
          .select("as_of_date")
          .order("as_of_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("qb_financials")
          .select("as_of_date")
          .order("as_of_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const attention = [...runLines, ...poLines].filter((l) => l.light !== "🟢");
    const summary = `PO radar — ${attention.length} of ${runLines.length + poLines.length} orders need attention`;
    const footer =
      `${today} · ${runLines.length} runs, ${poLines.length} POs monitored` +
      (reviewCount
        ? ` · ${reviewCount} email${reviewCount === 1 ? "" : "s"} in needs-review`
        : "");

    const briefingData: BriefingData = {
      weekday: format(now, "EEEE, MMM d"),
      salesThru: salesRow?.as_of_date ?? null,
      cashThru: cashRow?.as_of_date ?? null,
      needsReviewEmails: reviewCount ?? 0,
      runs: runLines.map(toBriefingRow),
      pos: poLines.map(toBriefingRow),
    };

    let briefing: string | null = null;
    try {
      briefing = await composeBriefing(briefingData);
    } catch (err) {
      console.error("[po-monitor] briefing writer failed, using fallback", err);
    }

    if (dry) {
      return {
        ok: true,
        dry: true,
        briefing,
        usedFallback: briefing == null,
        monitored: { runs: runLines.length, pos: poLines.length },
      };
    }

    await sendSlack({
      channel: getSlackDefaultChannel(),
      dedupeKey: `po-monitor:${today}`,
      text: summary,
      blocks: briefing
        ? briefingBlocks(briefing)
        : legacyBlocks(runLines, poLines, footer),
    });

    return {
      ok: true,
      usedFallback: briefing == null,
      monitored: { runs: runLines.length, pos: poLines.length },
      attention: attention.length,
      needsReviewEmails: reviewCount ?? 0,
    };
  });
}
