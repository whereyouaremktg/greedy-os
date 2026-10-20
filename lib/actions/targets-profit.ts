"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { weeklyInputsSchema, type WeeklyInputsInput } from "@/lib/targets/schemas";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };




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
