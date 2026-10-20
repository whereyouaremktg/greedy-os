"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runShopifyOrdersSync } from "@/lib/pullers/shopify-orders";
import {
  parseTargetsSettings,
  targetsSettingsSchema,
  TARGETS_SETTINGS_KEY,
  type TargetsSettings,
} from "@/lib/targets/settings";
import type { Json } from "@/types/db";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/** Manual "Refresh" — runs the incremental Shopify order sync inline. */
export async function refreshTargets(): Promise<
  ActionResult<{ ordersUpserted: number; complete: boolean; message: string }>
> {
  try {
    await requireUser();
    const summary = await runShopifyOrdersSync({ budgetMs: 50_000, trigger: "manual" });
    revalidatePath("/targets");
    return {
      ok: true,
      data: {
        ordersUpserted: summary.ordersUpserted,
        complete: summary.complete,
        message: summary.message,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Refresh failed" };
  }
}

/** Save the whole settings document (tiers, guardrails, overrides, dates). */
export async function saveTargetsSettings(
  input: TargetsSettings,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const parsed = targetsSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    const { error } = await supabase.from("targets_settings").upsert(
      {
        key: TARGETS_SETTINGS_KEY,
        value: parsed.data as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "key" },
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/targets");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

/** Patch only the manual overrides (the guardrail dialog). */
export async function saveTargetsOverrides(
  patch: Partial<TargetsSettings["overrides"]>,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireUser();
    const { data } = await supabase
      .from("targets_settings")
      .select("value")
      .eq("key", TARGETS_SETTINGS_KEY)
      .maybeSingle();
    const current = parseTargetsSettings(data?.value ?? null);
    const next: TargetsSettings = {
      ...current,
      overrides: { ...current.overrides, ...patch },
    };
    const parsed = targetsSettingsSchema.safeParse(next);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { error } = await supabase.from("targets_settings").upsert(
      {
        key: TARGETS_SETTINGS_KEY,
        value: parsed.data as unknown as Json,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: "key" },
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/targets");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}
