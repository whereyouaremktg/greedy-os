import "server-only";

import { listAllAuthUsers } from "@/lib/auth/admin-users";
import { formatRelativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SlackIdentityRow = {
  slack_user_id: string;
  supabase_user_id: string;
  email: string | null;
  linked_at: string;
  linked_at_relative: string;
  glow_email: string | null;
};

export type GlowAuthUserOption = {
  id: string;
  email: string;
};

export async function loadSlackIdentitiesSettings(): Promise<{
  rows: SlackIdentityRow[];
  authUsers: GlowAuthUserOption[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const service = createServiceClient();
  const [{ data: identities, error }, authUsers] = await Promise.all([
    service
      .from("slack_identities")
      .select("slack_user_id, supabase_user_id, email, linked_at")
      .order("linked_at", { ascending: false }),
    listAllAuthUsers(service),
  ]);

  if (error) {
    throw new Error(`loadSlackIdentitiesSettings: ${error.message}`);
  }

  const emailById = new Map(
    authUsers
      .filter((u) => u.email)
      .map((u) => [u.id, u.email as string]),
  );

  const now = Date.now();
  const rows: SlackIdentityRow[] = (identities ?? []).map((row) => {
    const linkedMs = now - new Date(row.linked_at).getTime();
    return {
      slack_user_id: row.slack_user_id,
      supabase_user_id: row.supabase_user_id,
      email: row.email,
      linked_at: row.linked_at,
      linked_at_relative: formatRelativeTime(linkedMs),
      glow_email: emailById.get(row.supabase_user_id) ?? null,
    };
  });

  const authUserOptions: GlowAuthUserOption[] = authUsers
    .filter((u) => u.email)
    .map((u) => ({ id: u.id, email: u.email as string }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return { rows, authUsers: authUserOptions };
}
