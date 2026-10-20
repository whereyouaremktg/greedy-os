import "server-only";
import type { Block, KnownBlock } from "@slack/web-api";
import { getSlackClient } from "@/lib/slack/client";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/db";

type SendSlackInput = {
  channel: string;
  blocks: (Block | KnownBlock)[];
  text: string;
  dedupeKey: string;
};

// Kill switch for every outbound Slack notification (cron triggers, PO radar,
// health + cron-failure alerts, inbound-email pings) — all of them post through
// sendSlack. OFF since 2026-10-20 while notifications move to another
// platform. Nothing is posted or recorded in slack_notifications while off.
// To re-enable: set this to true and restore the slack-triggers + health crons
// in vercel.ts.
const SLACK_NOTIFICATIONS_ENABLED = false;

type SendSlackResult =
  | { skipped: true; reason: "dedupe" | "disabled" }
  | { sent: true; ts: string };

export async function sendSlack(
  input: SendSlackInput,
): Promise<SendSlackResult> {
  if (!SLACK_NOTIFICATIONS_ENABLED) {
    return { skipped: true, reason: "disabled" };
  }

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("slack_notifications")
    .select("id")
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();

  if (existing) {
    return { skipped: true, reason: "dedupe" };
  }

  const slack = getSlackClient();
  const post = await slack.chat.postMessage({
    channel: input.channel,
    blocks: input.blocks,
    text: input.text,
  });

  if (!post.ok || !post.ts) {
    throw new Error(
      post.error ?? "sendSlack: chat.postMessage failed without ts",
    );
  }

  const { error } = await supabase.from("slack_notifications").insert({
    dedupe_key: input.dedupeKey,
    channel: input.channel,
    message_ts: post.ts,
    payload: { blocks: input.blocks, text: input.text } as unknown as Json,
  });

  if (error) {
    throw new Error(`sendSlack: failed to record notification — ${error.message}`);
  }

  return { sent: true, ts: post.ts };
}
