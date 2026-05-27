"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ActionResult = { ok: true } | { ok: false; error: string };

const slackUserIdSchema = z
  .string()
  .trim()
  .regex(/^U[A-Z0-9]+$/i, "Slack user ID must look like U07ABC123");

const upsertSchema = z.object({
  slack_user_id: slackUserIdSchema,
  supabase_user_id: z.string().uuid(),
});

async function requireAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

export async function upsertSlackIdentity(input: {
  slack_user_id: string;
  supabase_user_id: string;
}): Promise<ActionResult> {
  await requireAuthedUser();

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const service = createServiceClient();
  const { data: authUser, error: userError } = await service.auth.admin.getUserById(
    parsed.data.supabase_user_id,
  );

  if (userError || !authUser.user) {
    return { ok: false, error: "Glow OS user not found" };
  }

  const { error } = await service.from("slack_identities").upsert(
    {
      slack_user_id: parsed.data.slack_user_id,
      supabase_user_id: parsed.data.supabase_user_id,
      email: authUser.user.email ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "slack_user_id" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteSlackIdentity(
  slack_user_id: string,
): Promise<ActionResult> {
  await requireAuthedUser();

  const parsed = slackUserIdSchema.safeParse(slack_user_id);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("slack_identities")
    .delete()
    .eq("slack_user_id", parsed.data);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
