"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createCampaignCore } from "@/lib/campaigns/core";
import {
  campaignSchema,
  linkSchema,
  taskSchema,
  type CampaignFormValues,
  type LinkFormValues,
  type TaskFormValues,
} from "@/lib/campaigns/form-schema";
import { CAMPAIGN_TASK_STATUSES } from "@/lib/campaigns/types";
import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
