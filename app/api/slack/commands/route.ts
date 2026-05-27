import { generateText, stepCountIs } from "ai";
import { waitUntil } from "@vercel/functions";
import { buildGlowContext } from "@/lib/ai/context";
import { analystErrorSlackText } from "@/lib/ai/analyst-errors";
import { GLOW_MODEL } from "@/lib/ai/model";
import { GLOW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { extractWriteActions } from "@/lib/ai/slack-actions";
import { makeGlowTools } from "@/lib/ai/tools";
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
import { verifySlackSignature } from "@/lib/slack/verify";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function respondOnResponseUrl(
  responseUrl: string,
  body: Record<string, unknown>,
) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function handleSlashCommand(input: {
  slackUserId: string;
  responseUrl: string;
  question: string;
}) {
  let glowUser;
  try {
    glowUser = await resolveGlowUser(input.slackUserId);
  } catch (err) {
    if (err instanceof IdentityNotLinkedError) {
      await respondOnResponseUrl(input.responseUrl, {
        response_type: "ephemeral",
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

    const result = await generateText({
      model: GLOW_MODEL,
      system: `${GLOW_SYSTEM_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
      prompt: input.question,
      tools,
      stopWhen: stepCountIs(5),
    });

    const actions = extractWriteActions(result);
    const text =
      result.text.trim() ||
      (actions.length > 0
        ? actions.map((a) => a.label).join("\n")
        : "Done.");

    await respondOnResponseUrl(input.responseUrl, {
      response_type: "ephemeral",
      text,
      blocks: analystAnswerWithActionsBlocks(text, actions),
    });
  } catch (err) {
    console.error("[slack/commands] analyst error", err);
    const text = analystErrorSlackText(err);
    await respondOnResponseUrl(input.responseUrl, {
      response_type: "ephemeral",
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

  const params = new URLSearchParams(rawBody);
  const userId = params.get("user_id");
  const responseUrl = params.get("response_url");
  const text = params.get("text")?.trim() ?? "";

  if (!userId || !responseUrl) {
    return new Response("Missing user_id or response_url", { status: 400 });
  }

  if (!text) {
    return Response.json({
      response_type: "ephemeral",
      text: "Usage: `/glow <your question>` — e.g. `/glow how is our cash?`",
    });
  }

  waitUntil(
    handleSlashCommand({
      slackUserId: userId,
      responseUrl,
      question: text,
    }),
  );

  return Response.json({
    response_type: "ephemeral",
    text: "Working on it…",
  });
}
