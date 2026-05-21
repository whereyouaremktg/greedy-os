import "server-only";
import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;
let botUserIdPromise: Promise<string | undefined> | null = null;

export function getSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "getSlackClient: SLACK_BOT_TOKEN is not configured. Set it in Vercel env and .env.local.",
    );
  }
  if (!client) {
    client = new WebClient(token);
  }
  return client;
}

export function getSlackDefaultChannel(): string {
  const channel = process.env.SLACK_DEFAULT_CHANNEL;
  if (!channel) {
    throw new Error(
      "getSlackDefaultChannel: SLACK_DEFAULT_CHANNEL is not configured.",
    );
  }
  return channel;
}

export async function getSlackBotUserId(): Promise<string | undefined> {
  if (!botUserIdPromise) {
    botUserIdPromise = getSlackClient()
      .auth.test()
      .then((res) => res.user_id)
      .catch(() => undefined);
  }
  return botUserIdPromise;
}
