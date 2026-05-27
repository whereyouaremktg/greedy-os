"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCampaignCore } from "@/lib/campaigns/core";
import {
  CAMPAIGN_LINK_SOURCES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TASK_STATUSES,
  CAMPAIGN_TYPES,
} from "@/lib/campaigns/types";
import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).transform((v) =>
      v.length > 0 ? v : null,
    ),
  );

export const campaignSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Name is required")),
  type: z.enum(CAMPAIGN_TYPES),
  status: z.enum(CAMPAIGN_STATUSES),
  start_date: optionalDate,
  end_date: optionalDate,
  notes: optionalText,
});

export type CampaignFormValues = z.input<typeof campaignSchema>;

export const taskSchema = z.object({
  campaign_id: z.string().uuid(),
  title: z
    .string()
    .max(300)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Title is required")),
  owner: optionalText,
  due_date: optionalDate,
  status: z.enum(CAMPAIGN_TASK_STATUSES).optional(),
});

export type TaskFormValues = z.input<typeof taskSchema>;

export const linkSchema = z.object({
  campaign_id: z.string().uuid(),
  label: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Label is required")),
  url: z
    .string()
    .max(2000)
    .transform((v) => v.trim())
    .pipe(z.string().url("Enter a valid URL")),
  source: z.enum(CAMPAIGN_LINK_SOURCES),
});

export type LinkFormValues = z.input<typeof linkSchema>;

const idSchema = z.string().uuid();

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

function revalidateCampaigns() {
  revalidatePath("/campaigns");
  revalidateTimelinePaths();
}

export async function createCampaign(
  input: CampaignFormValues,
): Promise<ActionResult> {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const created = await createCampaignCore(supabase, user?.id ?? null, parsed.data);
  if (!created.ok) {
    return { ok: false, error: created.error.message };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function updateCampaign(
  id: string,
  input: CampaignFormValues,
): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid campaign id" };
  }

  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(parsed.data)
    .eq("id", idResult.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to update campaign" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid campaign id" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", idResult.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to delete campaign" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function createTask(input: TaskFormValues): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaign_tasks").insert({
    campaign_id: parsed.data.campaign_id,
    title: parsed.data.title,
    owner: parsed.data.owner,
    due_date: parsed.data.due_date,
    status: parsed.data.status ?? "todo",
  });

  if (error) {
    return { ok: false, error: error.message ?? "Failed to create task" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function updateTaskStatus(
  id: string,
  status: (typeof CAMPAIGN_TASK_STATUSES)[number],
): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid task id" };
  }

  const statusResult = z.enum(CAMPAIGN_TASK_STATUSES).safeParse(status);
  if (!statusResult.success) {
    return { ok: false, error: "Invalid task status" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_tasks")
    .update({ status: statusResult.data })
    .eq("id", idResult.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to update task" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid task id" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_tasks")
    .delete()
    .eq("id", idResult.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to delete task" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function createLink(input: LinkFormValues): Promise<ActionResult> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("campaign_links").insert(parsed.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to add link" };
  }

  revalidateCampaigns();
  return { ok: true };
}

export async function deleteLink(id: string): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return { ok: false, error: "Invalid link id" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_links")
    .delete()
    .eq("id", idResult.data);

  if (error) {
    return { ok: false, error: error.message ?? "Failed to delete link" };
  }

  revalidateCampaigns();
  return { ok: true };
}
