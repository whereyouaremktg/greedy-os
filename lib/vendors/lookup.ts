import type { SupabaseClient } from "@supabase/supabase-js";

import { createVendorCore } from "@/lib/vendors/core";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type VendorLookupError = { code: string; message: string };

export type VendorLookupResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: VendorLookupError };

export async function findOrCreateVendorByName(
  supabase: Client,
  actorUserId: string | null,
  name: string,
): Promise<
  VendorLookupResult<{ id: string; name: string; created: boolean }>
> {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: { code: "INVALID", message: "Vendor name is required" },
    };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("vendors")
    .select("id, name")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      error: {
        code: lookupError.code ?? "DB_ERROR",
        message: lookupError.message ?? "Failed to look up vendor",
      },
    };
  }

  if (existing) {
    return { ok: true, data: { ...existing, created: false } };
  }

  const created = await createVendorCore(supabase, actorUserId, {
    name: trimmed,
  });

  if (!created.ok) return created;

  return {
    ok: true,
    data: { ...created.data, created: true },
  };
}
