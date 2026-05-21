import "server-only";
import type { User } from "@supabase/supabase-js";
import { getSlackClient } from "@/lib/slack/client";
import { createServiceClient } from "@/lib/supabase/service";

const cache = new Map<string, User | null>();

export async function resolveGlowUser(
  slackUserId: string,
): Promise<User | null> {
  if (cache.has(slackUserId)) {
    return cache.get(slackUserId) ?? null;
  }

  const slack = getSlackClient();
  const info = await slack.users.info({ user: slackUserId });
  const email = info.user?.profile?.email?.toLowerCase();

  if (!email) {
    cache.set(slackUserId, null);
    return null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(`resolveGlowUser: auth lookup failed — ${error.message}`);
  }

  const user =
    data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  cache.set(slackUserId, user);
  return user;
}

export const UNAUTHORIZED_SLACK_MESSAGE =
  "Sorry, I don't recognize this Slack account in Glow OS.";
