"use server";

import { searchGlobalCore } from "@/lib/search/core";
import type { GlobalSearchResults } from "@/lib/search/types";
import { createClient } from "@/lib/supabase/server";

export type SearchActionResult =
  | { ok: true; data: GlobalSearchResults }
  | { ok: false; error: string };

export async function searchGlobal(
  query: string,
): Promise<SearchActionResult> {
  if (typeof query !== "string" || query.length > 200) {
    return { ok: false, error: "Invalid search query" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  try {
    const data = await searchGlobalCore(supabase, query);
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Search failed" };
  }
}
