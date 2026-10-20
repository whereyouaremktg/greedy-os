"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const money = z.number().nonnegative().nullable();

export const weeklyInputsSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ad_spend_meta: money,
  ad_spend_tiktok: money,
  ad_spend_google: money,
  ad_spend_other: money,
  threepl_cost: money,
  other_opex: money,
  cogs_override: money,
  notes: z.string().max(2000).nullable(),
});

export type WeeklyInputsInput = z.infer<typeof weeklyInputsSchema>;

export async function saveWeeklyInputs(input: WeeklyInputsInput): Promise<ActionResult> {
  const parsed = weeklyInputsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("targets_weekly_inputs")
    .upsert({ ...parsed.data, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "week_start" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/targets");
  return { ok: true };
}

const unitCostSchema = z.object({
  sku: z.string().min(1).max(100),
  unit_cost_usd: z.number().nonnegative().nullable(),
});

/** Set (or clear) the landed unit cost for a product SKU. */
export async function saveProductUnitCost(input: z.infer<typeof unitCostSchema>): Promise<ActionResult> {
  const parsed = unitCostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const { error } = await supabase
    .from("products")
    .update({ unit_cost_usd: parsed.data.unit_cost_usd })
    .eq("sku", parsed.data.sku);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/targets");
  revalidatePath("/products");
  return { ok: true };
}
