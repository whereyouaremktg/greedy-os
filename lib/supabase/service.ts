import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

// Service-role client. Bypasses RLS. Server-only. Used by:
//   - Cron pullers (writing to MIRRORED cache tables)
//   - Admin scripts
// NEVER import from a client component or route file reachable in the browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
