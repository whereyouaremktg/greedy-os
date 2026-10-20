"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export const launchDropSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  drop_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  planned_units: z.number().int().nonnegative().nullable(),
  skus: z.array(z.string().min(1).max(100)).max(50),
  notes: z.string().max(2000).nullable(),
});

export type LaunchDropInput = z.infer<typeof launchDropSchema>;

export async function saveLaunchDrop(input: LaunchDropInput): Promise<ActionResult<{ id: string }>> {
  const parsed = launchDropSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { id, ...rest } = parsed.data;
  const row = { ...rest, skus: rest.skus.map((s) => s.trim().toUpperCase()).filter(Boolean) };
  if (id) {
    const { error } = await supabase.from("launch_drops").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/targets");
    return { ok: true, data: { id } };
  }
  const { data, error } = await supabase
    .from("launch_drops")
    .insert({ ...row, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/targets");
  return { ok: true, data: { id: data.id } };
}

export async function deleteLaunchDrop(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const { error } = await supabase.from("launch_drops").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/targets");
  return { ok: true };
}
