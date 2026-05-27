import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type VendorCoreError = { code: string; message: string };

export type VendorCoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: VendorCoreError };

export const createVendorInput = z.object({
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

function dbError(
  err: { code?: string; message?: string } | null,
  fallback: string,
): VendorCoreError {
  return {
    code: err?.code ?? "DB_ERROR",
    message: err?.message ?? fallback,
  };
}

export async function createVendorCore(
  supabase: Client,
  actorUserId: string | null,
  input: z.infer<typeof createVendorInput>,
): Promise<VendorCoreResult<{ id: string; name: string }>> {
  const row: Database["public"]["Tables"]["vendors"]["Insert"] = {
    name: input.name.trim(),
    contact_name: input.contact_name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    ...(actorUserId ? { created_by: actorUserId } : {}),
  };

  const { data, error } = await supabase
    .from("vendors")
    .insert(row)
    .select("id, name")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: dbError(error, "Failed to create vendor"),
    };
  }

  return { ok: true, data: { id: data.id, name: data.name } };
}
