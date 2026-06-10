import "server-only";
import type { ModelMessage } from "ai";

import { getSlackClient } from "@/lib/slack/client";

function stripBotMention(text: string, botUserId?: string): string {
  if (botUserId) {
    return text.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim();
  }
  return text.replace(/<@[A-Z0-9]+>\s*/g, "").trim();
}

/**
 * Pull a Slack thread's prior messages and turn them into model messages so the
 * analyst can hold a real back-and-forth conversation instead of treating every
 * mention as a standalone question.
 *
 * The bot's own replies become `assistant` turns; everyone else's become `user`
 * turns. The triggering message (latest) is included as the final user turn, so
 * callers should pass these straight to generateText without re-appending it.
 *
 * Falls back to a single user message if the thread can't be read.
 */
export type ThreadMessagesResult = {
  messages: ModelMessage[];
  /** False when the thread couldn't be read (e.g. token missing
   * channels:history — the app must be reinstalled after scope changes). */
  historyAvailable: boolean;
};

export async function buildThreadMessages(input: {
  channel: string;
  threadTs: string;
  botUserId?: string;
  fallbackQuestion: string;
  limit?: number;
}): Promise<ThreadMessagesResult> {
  const { channel, threadTs, botUserId, fallbackQuestion, limit = 20 } = input;

  try {
    const slack = getSlackClient();
    const res = await slack.conversations.replies({
      channel,
      ts: threadTs,
      limit,
    });

    const raw = res.messages ?? [];
    const messages: ModelMessage[] = [];

    for (const m of raw) {
      const text = (m.text ?? "").trim();
      if (!text) continue;
      // Skip system/join noise; keep human and bot chat turns.
      const subtype = (m as { subtype?: string }).subtype;
      if (subtype && subtype !== "bot_message") continue;

      const isBot = Boolean(m.bot_id) || (botUserId && m.user === botUserId);
      const cleaned = stripBotMention(text, botUserId);
      if (!cleaned) continue;

      messages.push({
        role: isBot ? "assistant" : "user",
        content: cleaned,
      });
    }

    // Last turn must be the user's question for the model to answer it.
    const last = messages.at(-1);
    if (!last || last.role !== "user") {
      messages.push({ role: "user", content: fallbackQuestion });
    }

    return {
      messages:
        messages.length > 0
          ? messages
          : [{ role: "user", content: fallbackQuestion }],
      historyAvailable: true,
    };
  } catch (err) {
    // Loud, not silent: a missing_scope here means the Slack app was never
    // reinstalled after channels:history/groups:history landed in the
    // manifest, and the analyst loses all thread memory in channels.
    console.error(
      `[slack/thread] conversations.replies failed for ${channel}/${threadTs} — ` +
        "falling back to the latest message only. If the error is missing_scope, " +
        "reinstall the Slack app so the token picks up channels:history.",
      err,
    );
    return {
      messages: [{ role: "user", content: fallbackQuestion }],
      historyAvailable: false,
    };
  }
}
