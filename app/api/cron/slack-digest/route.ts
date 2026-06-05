import { generateText, stepCountIs } from "ai";

import { buildGlowContext } from "@/lib/ai/context";
import { GLOW_DIGEST_MODEL } from "@/lib/ai/model";
import { GLOW_DIGEST_PROMPT } from "@/lib/ai/prompt";
import { makeGlowTools } from "@/lib/ai/tools";
import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import { sendSlack } from "@/lib/slack/dispatch";
import { dailyDigestBlocks } from "@/lib/slack/messages";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return runCronJob(async () => {
    const supabase = createServiceClient();
    const channel = getSlackDefaultChannel();
    const today = todayIso();

    const context = await buildGlowContext(supabase);
    const tools = makeGlowTools({
      supabase,
      actorUserId: null,
      source: "slack",
    });

    const result = await generateText({
      model: GLOW_DIGEST_MODEL,
      system: `${GLOW_DIGEST_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
      prompt: `Write the morning briefing for ${today}.`,
      tools,
      stopWhen: stepCountIs(6),
    });

    const body = result.text.trim();
    if (!body) {
      return { ok: true, posted: false, reason: "empty briefing" };
    }

    // One digest per day, even if the cron fires more than once.
    const send = await sendSlack({
      channel,
      dedupeKey: `daily-digest:${today}`,
      text: "Glow OS — morning briefing",
      blocks: dailyDigestBlocks({
        heading: "☀️ Glow OS — morning briefing",
        body,
      }),
    });

    return {
      ok: true,
      posted: "sent" in send && send.sent,
      date: today,
    };
  });
}
