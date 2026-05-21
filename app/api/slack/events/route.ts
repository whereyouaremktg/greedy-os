import { generateText } from "ai";
import { waitUntil } from "@vercel/functions";
import { buildGlowContext } from "@/lib/ai/context";
import { GLOW_MODEL } from "@/lib/ai/model";
import { GLOW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { getSlackBotUserId, getSlackClient } from "@/lib/slack/client";
import {
  resolveGlowUser,
  UNAUTHORIZED_SLACK_MESSAGE,
} from "@/lib/slack/identity";
import { analystAnswerBlocks, errorBlocks } from "@/lib/slack/messages";
import { verifySlackSignature } from "@/lib/slack/verify";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type SlackEventPayload = {
  type: string;
  challenge?: string;
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
}) {
  const slack = getSlackClient();
  const glowUser = await resolveGlowUser(input.slackUserId);

  if (!glowUser) {
    await slack.chat.postMessage({
      channel: input.channel,
      thread_ts: input.threadTs,
      text: UNAUTHORIZED_SLACK_MESSAGE,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${UNAUTHORIZED_SLACK_MESSAGE}*`,
          },
        },
      ],
    });
    return;
  }

  try {
    const supabase = createServiceClient();
    const context = await buildGlowContext(supabase);
    const { text } = await generateText({
      model: GLOW_MODEL,
      system: `${GLOW_SYSTEM_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
      prompt: input.question,
    });

    await slack.chat.postMessage({
      channel: input.channel,
      thread_ts: input.threadTs,
      text,
      blocks: analystAnswerBlocks(text),
    });
  } catch (err) {
    console.error("[slack/events] analyst error", err);
    await slack.chat.postMessage({
      channel: input.channel,
      thread_ts: input.threadTs,
      text: "I hit an issue — Paul, check logs.",
      blocks: errorBlocks(),
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

  const threadTs = event.thread_ts ?? event.ts ?? "";

  waitUntil(
    handleAnalystQuestion({
      slackUserId: event.user,
      channel: event.channel,
      threadTs,
      question,
    }),
  );

  return new Response("ok");
}
