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

type SendSlackResult =
  | { skipped: true; reason: "dedupe" }
  | { sent: true; ts: string };

export async function sendSlack(
  input: SendSlackInput,
): Promise<SendSlackResult> {
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
