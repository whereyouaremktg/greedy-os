import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  findUserByEmail,
  listAllAuthUsers,
} from "@/lib/auth/admin-users";
import { getSlackClient } from "@/lib/slack/client";
import { createServiceClient } from "@/lib/supabase/service";

const cache = new Map<string, User>();

export class IdentityNotLinkedError extends Error {
  readonly slackUserId: string;
  readonly slackEmail: string | null;

  constructor(slackUserId: string, slackEmail: string | null) {
    super("Slack identity not linked");
    this.name = "IdentityNotLinkedError";
    this.slackUserId = slackUserId;
    this.slackEmail = slackEmail;
  }
}

async function fetchMappedUser(
  slackUserId: string,
): Promise<User | null> {
  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from("slack_identities")
    .select("supabase_user_id")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveGlowUser: mapping lookup failed — ${error.message}`);
  }
  if (!row) return null;

  const { data: userData, error: userError } =
    await supabase.auth.admin.getUserById(row.supabase_user_id);

  if (userError || !userData.user) {
    throw new Error(
      `resolveGlowUser: mapped user missing — ${userError?.message ?? "not found"}`,
    );
  }

  return userData.user;
}

async function autoLinkByEmail(
  slackUserId: string,
  slackEmail: string,
): Promise<User | null> {
  const supabase = createServiceClient();
  const authUsers = await listAllAuthUsers(supabase);
  const match = findUserByEmail(authUsers, slackEmail);
  if (!match?.id) return null;

  const { error: insertError } = await supabase.from("slack_identities").insert({
    slack_user_id: slackUserId,
    supabase_user_id: match.id,
    email: slackEmail.trim(),
  });

  if (insertError && insertError.code !== "23505") {
    throw new Error(
      `resolveGlowUser: failed to persist auto-link — ${insertError.message}`,
    );
  }

  return match;
}

async function slackProfileEmail(slackUserId: string): Promise<string | null> {
  const slack = getSlackClient();
  const info = await slack.users.info({ user: slackUserId });
  const raw = info.user?.profile?.email;
  if (!raw?.trim()) return null;
  return raw.trim();
}

export async function resolveGlowUser(slackUserId: string): Promise<User> {
  if (cache.has(slackUserId)) {
    const cached = cache.get(slackUserId);
    if (cached) return cached;
  }

  const mapped = await fetchMappedUser(slackUserId);
  if (mapped) {
    cache.set(slackUserId, mapped);
    return mapped;
  }

  const slackEmail = await slackProfileEmail(slackUserId);
  if (slackEmail) {
    const linked = await autoLinkByEmail(slackUserId, slackEmail);
    if (linked) {
      cache.set(slackUserId, linked);
      return linked;
    }
  }

  throw new IdentityNotLinkedError(slackUserId, slackEmail);
}
