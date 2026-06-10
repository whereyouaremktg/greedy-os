import { generateText, stepCountIs } from "ai";
import { waitUntil } from "@vercel/functions";
import { buildGlowContext } from "@/lib/ai/context";
import { analystErrorSlackText } from "@/lib/ai/analyst-errors";
import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_MODEL } from "@/lib/ai/model";
import { GLOW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { extractWriteActions } from "@/lib/ai/slack-actions";
import { makeGlowTools } from "@/lib/ai/tools";
import { getSlackBotUserId, getSlackClient } from "@/lib/slack/client";
import {
  IdentityNotLinkedError,
  resolveGlowUser,
} from "@/lib/slack/identity";
import {
  analystAnswerWithActionsBlocks,
  errorBlocks,
  identityNotLinkedBlocks,
  identityNotLinkedText,
} from "@/lib/slack/messages";
import { buildThreadMessages } from "@/lib/slack/thread";
import { verifySlackSignature } from "@/lib/slack/verify";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type SlackEventPayload = {
  type: string;
  challenge?: string;
  event_id?: string;
  event?: SlackMessageEvent;
};

type SlackMessageEvent = {
  type: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  channel?: string;
  channel_type?: string;
};

function stripBotMention(text: string, botUserId?: string): string {
  if (botUserId) {
    return text.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim();
  }
  return text.replace(/<@[A-Z0-9]+>\s*/g, "").trim();
}

function shouldIgnoreEvent(
  event: SlackMessageEvent,
  botUserId?: string,
): boolean {
  if (event.bot_id) return true;
  if (event.subtype && event.subtype !== "file_share") return true;
  if (botUserId && event.user === botUserId) return true;
  const appId = process.env.SLACK_APP_ID;
  if (appId && event.bot_id === appId) return true;
  return false;
}

async function handleAnalystQuestion(input: {
  slackUserId: string;
  channel: string;
  threadTs: string;
  question: string;
  botUserId?: string;
}) {
  const slack = getSlackClient();

  let glowUser;
  try {
    glowUser = await resolveGlowUser(input.slackUserId);
  } catch (err) {
    if (err instanceof IdentityNotLinkedError) {
      await slack.chat.postMessage({
        channel: input.channel,
        thread_ts: input.threadTs,
        text: identityNotLinkedText(err.slackUserId, err.slackEmail),
        blocks: identityNotLinkedBlocks(err.slackUserId, err.slackEmail),
      });
      return;
    }
    throw err;
  }

  try {
    const supabase = createServiceClient();
    const context = await buildGlowContext(supabase);
    const tools = makeGlowTools({
      supabase,
      actorUserId: glowUser.id,
      source: "slack",
    });

    const thread = await buildThreadMessages({
      channel: input.channel,
      threadTs: input.threadTs,
      botUserId: input.botUserId,
      fallbackQuestion: input.question,
    });

    // When the thread can't be read, the model only sees the latest message.
    // Say so, so it asks for missing details instead of guessing (or claiming
    // the conversation "just started").
    const historyNote = thread.historyAvailable
      ? ""
      : "\n\nNOTE: You could NOT read this Slack thread's earlier messages " +
        "(permissions issue) — you only see the latest one. If it references " +
        "earlier context you don't have, say you can't see the earlier " +
        "messages and ask the user to restate the details in one message.";

    const result = await withModelFallback(GLOW_MODEL, (model) =>
      generateText({
        model,
        system: `${GLOW_SYSTEM_PROMPT}${historyNote}\n\nDATA:\n${JSON.stringify(context)}`,
        messages: thread.messages,
        tools,
        stopWhen: stepCountIs(12),
      }),
    );

    const actions = extractWriteActions(result);
    const text =
      result.text.trim() ||
      (actions.length > 0
        ? actions.map((a) => a.label).join("\n")
        : "Done.");

    await slack.chat.postMessage({
      channel: input.channel,
      thread_ts: input.threadTs,
      text,
      blocks: analystAnswerWithActionsBlocks(text, actions),
    });
  } catch (err) {
    console.error("[slack/events] analyst error", err);
    const text = analystErrorSlackText(err);
    await slack.chat.postMessage({
      channel: input.channel,
      thread_ts: input.threadTs,
      text,
      blocks: errorBlocks(text),
    });
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as SlackEventPayload;

  if (payload.type === "url_verification" && payload.challenge) {
    return Response.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || !payload.event) {
    return new Response("ok");
  }

  const event = payload.event;
  const botUserId = await getSlackBotUserId();

  if (shouldIgnoreEvent(event, botUserId)) {
    return new Response("ok");
  }

  const isMention = event.type === "app_mention";
  const isDm =
    event.type === "message" &&
    (event.channel_type === "im" || event.channel?.startsWith("D"));

  if (!isMention && !isDm) {
    return new Response("ok");
  }

  if (!event.user || !event.channel || !event.text?.trim()) {
    return new Response("ok");
  }

  const question = stripBotMention(event.text, botUserId);
  if (!question) {
    return new Response("ok");
  }

  // Slack re-delivers events it thinks we didn't ack (slow cold start) and can
  // deliver one message under two subscriptions (app_mention + message.im).
  // Either would re-run a write-capable agent turn — e.g. a duplicate PO — so
  // (a) drop retry deliveries outright, (b) claim the event_id in
  // slack_notifications (unique dedupe_key) before processing.
  if (request.headers.get("x-slack-retry-num")) {
    return new Response("ok", { headers: { "x-slack-no-retry": "1" } });
  }

  if (payload.event_id) {
    const { error: dupError } = await createServiceClient()
      .from("slack_notifications")
      .insert({
        dedupe_key: `slack-event:${payload.event_id}`,
        channel: event.channel ?? "unknown",
        message_ts: event.ts ?? null,
        payload: { kind: "event-claim", type: event.type },
      });
    if (dupError) {
      if (dupError.code === "23505") {
        return new Response("ok"); // already handled this delivery
      }
      // Dedupe table hiccup — log and answer anyway; a rare double reply
      // beats silently dropping the question.
      console.warn("[slack/events] event dedupe insert failed", dupError);
    }
  }

  const threadTs = event.thread_ts ?? event.ts ?? "";

  waitUntil(
    handleAnalystQuestion({
      slackUserId: event.user,
      channel: event.channel,
      threadTs,
      question,
      botUserId,
    }).catch((err) =>
      console.error("[slack/events] unhandled analyst error", err),
    ),
  );

  return new Response("ok");
}
