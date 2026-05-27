import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CAMPAIGN_TASK_TEMPLATES,
  dueDateFromOffset,
} from "@/lib/campaigns/templates";
import type { CampaignType } from "@/lib/campaigns/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type CoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message: string } };

export type CreateCampaignInput = {
  name: string;
  type: CampaignType;
  status: Database["public"]["Enums"]["campaign_status"];
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

export async function createCampaignCore(
  supabase: Client,
  userId: string | null,
  input: CreateCampaignInput,
): Promise<CoreResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      name: input.name,
      type: input.type,
      status: input.status,
      start_date: input.start_date,
      end_date: input.end_date,
      notes: input.notes,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: { code: error?.code, message: error?.message ?? "Failed to create campaign" },
    };
  }

  const templates = CAMPAIGN_TASK_TEMPLATES[input.type];
  if (templates.length > 0) {
    const tasks = templates.map((template) => ({
      campaign_id: data.id,
      title: template.title,
      status: "todo" as const,
      due_date: dueDateFromOffset(input.start_date, template.offsetDays),
    }));

    const { error: taskError } = await supabase
      .from("campaign_tasks")
      .insert(tasks);

    if (taskError) {
      return {
        ok: false,
        error: {
          code: taskError.code,
          message: taskError.message ?? "Campaign created but tasks failed",
        },
      };
    }
  }

  return { ok: true, data: { id: data.id } };
}
