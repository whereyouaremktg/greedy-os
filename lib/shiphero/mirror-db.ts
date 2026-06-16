import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// The ShipHero mirror tables (shiphero_inbound_pos, shiphero_wholesale_orders)
// are intentionally NOT in the generated types/db.ts — same as retroship_inventory,
// which lib/inventory/load.ts already reads through an untyped cast. We mirror
// that approach for writes so we don't hand-maintain the generated Database type.

type WriteResult = { error: { message: string } | null };

export type MirrorDb = {
  from: (table: string) => {
    delete: () => { eq: (col: string, val: string) => Promise<WriteResult> };
    insert: (rows: unknown[]) => Promise<WriteResult>;
  };
};

export function mirrorDb(): MirrorDb {
  return createServiceClient() as unknown as MirrorDb;
}

// Tenant-scoped full replace: clear this tenant's rows, then insert the fresh
// snapshot. Mirrors the shopify_inventory puller's delete-then-insert, but
// scoped by tenant_id (the composite PK demands it — see migration 0017).
export async function fullReplaceForTenant(
  db: MirrorDb,
  table: string,
  tenantId: string,
  rows: unknown[],
): Promise<number> {
  const del = await db.from(table).delete().eq("tenant_id", tenantId);
  if (del.error) throw new Error(`${table} clear: ${del.error.message}`);

  if (rows.length > 0) {
    const ins = await db.from(table).insert(rows);
    if (ins.error) throw new Error(`${table} insert: ${ins.error.message}`);
  }
  return rows.length;
}
