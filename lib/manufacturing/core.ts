import type { SupabaseClient } from "@supabase/supabase-js";

import { todayIso } from "@/lib/manufacturing/dates";
import type { ManufacturingStage } from "@/lib/manufacturing/stages";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type CoreError = { code: string; message: string };

export type CoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CoreError };

export type CreateRunInput = {
  vendor_id: string;
  purchase_order_id?: string | null;
  product_id?: string | null;
  product_name: string;
  variant?: string | null;
  quantity: number;
  stage?: ManufacturingStage;
  expected_completion_date?: string | null;
  expected_arrival_date?: string | null;
  actual_completion_date?: string | null;
  actual_arrival_date?: string | null;
  notes?: string | null;
};

export type UpdateRunInput = CreateRunInput;

export type UpdateRunDatesInput = {
  expected_completion_date?: string | null;
  expected_arrival_date?: string | null;
  actual_completion_date?: string | null;
  actual_arrival_date?: string | null;
};

function dbError(
  err: { code?: string; message?: string } | null,
  fallback: string,
): CoreError {
  return {
    code: err?.code ?? "DB_ERROR",
    message: err?.message ?? fallback,
  };
}

export async function createRunCore(
  supabase: Client,
  actorUserId: string | null,
  input: CreateRunInput,
): Promise<CoreResult<{ id: string }>> {
  const row: Database["public"]["Tables"]["manufacturing_runs"]["Insert"] = {
    vendor_id: input.vendor_id,
    purchase_order_id: input.purchase_order_id ?? null,
    product_id: input.product_id ?? null,
    product_name: input.product_name,
    variant: input.variant ?? null,
    quantity: input.quantity,
    stage: input.stage ?? "ordered",
    expected_completion_date: input.expected_completion_date ?? null,
    expected_arrival_date: input.expected_arrival_date ?? null,
    actual_completion_date: input.actual_completion_date ?? null,
    actual_arrival_date: input.actual_arrival_date ?? null,
    notes: input.notes ?? null,
    ...(actorUserId ? { created_by: actorUserId } : {}),
  };

  const { data, error } = await supabase
    .from("manufacturing_runs")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to create manufacturing run"),
    };
  }

  return { ok: true, data: { id: data.id } };
}

export async function updateRunStageCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
  newStage: ManufacturingStage,
): Promise<CoreResult<{ id: string; stage: ManufacturingStage }>> {
  const { data: existing, error: fetchError } = await supabase
    .from("manufacturing_runs")
    .select("id, actual_completion_date, actual_arrival_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return {
      ok: false,
      error: dbError(fetchError, "Failed to load manufacturing run"),
    };
  }
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
    };
  }

  const patch: Database["public"]["Tables"]["manufacturing_runs"]["Update"] = {
    stage: newStage,
  };

  if (newStage === "complete" && !existing.actual_completion_date) {
    patch.actual_completion_date = todayIso();
  }
  if (newStage === "received" && !existing.actual_arrival_date) {
    patch.actual_arrival_date = todayIso();
  }

  const { data, error } = await supabase
    .from("manufacturing_runs")
    .update(patch)
    .eq("id", id)
    .select("id, stage")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to update run stage"),
    };
  }

  return { ok: true, data: { id: data.id, stage: data.stage } };
}

export async function updateRunDatesCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
  dates: UpdateRunDatesInput,
): Promise<CoreResult<{ id: string }>> {
  const patch: Database["public"]["Tables"]["manufacturing_runs"]["Update"] =
    {};

  if ("expected_completion_date" in dates) {
    patch.expected_completion_date = dates.expected_completion_date ?? null;
  }
  if ("expected_arrival_date" in dates) {
    patch.expected_arrival_date = dates.expected_arrival_date ?? null;
  }
  if ("actual_completion_date" in dates) {
    patch.actual_completion_date = dates.actual_completion_date ?? null;
  }
  if ("actual_arrival_date" in dates) {
    patch.actual_arrival_date = dates.actual_arrival_date ?? null;
  }

  const { data, error } = await supabase
    .from("manufacturing_runs")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
      };
    }
    return {
      ok: false,
      error: dbError(error, "Failed to update run dates"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
    };
  }

  return { ok: true, data: { id: data.id } };
}

export async function updateRunCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
  input: UpdateRunInput,
): Promise<CoreResult<{ id: string }>> {
  const patch: Database["public"]["Tables"]["manufacturing_runs"]["Update"] = {
    vendor_id: input.vendor_id,
    purchase_order_id: input.purchase_order_id ?? null,
    product_id: input.product_id ?? null,
    product_name: input.product_name,
    variant: input.variant ?? null,
    quantity: input.quantity,
    stage: input.stage ?? "ordered",
    expected_completion_date: input.expected_completion_date ?? null,
    expected_arrival_date: input.expected_arrival_date ?? null,
    actual_completion_date: input.actual_completion_date ?? null,
    actual_arrival_date: input.actual_arrival_date ?? null,
    notes: input.notes ?? null,
  };

  const { data, error } = await supabase
    .from("manufacturing_runs")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
      };
    }
    return {
      ok: false,
      error: dbError(error, "Failed to update manufacturing run"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
    };
  }

  return { ok: true, data: { id: data.id } };
}

export async function appendRunNotesCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
  notesAppend: string,
): Promise<CoreResult<{ id: string }>> {
  const trimmed = notesAppend.trim();
  if (!trimmed) {
    return { ok: true, data: { id } };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("manufacturing_runs")
    .select("id, notes")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return {
      ok: false,
      error: dbError(fetchError, "Failed to load manufacturing run"),
    };
  }
  if (!existing) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
    };
  }

  const merged = existing.notes?.trim()
    ? `${existing.notes.trim()}\n${trimmed}`
    : trimmed;

  const { data, error } = await supabase
    .from("manufacturing_runs")
    .update({ notes: merged })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to append run notes"),
    };
  }

  return { ok: true, data: { id: data.id } };
}

export async function deleteRunCore(
  supabase: Client,
  _actorUserId: string | null,
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const { data, error } = await supabase
    .from("manufacturing_runs")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
      };
    }
    return {
      ok: false,
      error: dbError(error, "Failed to delete manufacturing run"),
    };
  }
  if (!data) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Manufacturing run not found" },
    };
  }

  return { ok: true, data: { id: data.id } };
}
