import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// The ShipHero mirror tables (shiphero_inbound_pos, shiphero_wholesale_orders)
// are intentionally NOT in the generated types/db.ts — same as retroship_inventory,
// which lib/inventory/load.ts already reads through an untyped cast. We mirror
// that approach for writes so we don't hand-maintain the generated Database type.

type WriteResult = { error: { message: string } | null };

export type MirrorDb = {
  from: (table: string) => {
    delete: () => {
      neq: (col: string, val: string) => Promise<WriteResult>;
      gte: (col: string, val: string) => Promise<WriteResult>;
    };
    insert: (rows: unknown[]) => Promise<WriteResult>;
    upsert: (rows: unknown[], opts: { onConflict: string }) => Promise<WriteResult>;
  };
};

export function mirrorDb(): MirrorDb {
  return createServiceClient() as unknown as MirrorDb;
}

// Full replace: clear the table, then insert the fresh snapshot — the
// current-state mirror pattern (see lib/pullers/shopify-inventory.ts). The
// `neq` with an impossible value is Supabase's idiom for an unfiltered delete.
export async function fullReplace(
  db: MirrorDb,
  table: string,
  keyColumn: string,
  rows: unknown[],
): Promise<number> {
  const del = await db.from(table).delete().neq(keyColumn, "__never__");
  if (del.error) throw new Error(`${table} clear: ${del.error.message}`);

  if (rows.length > 0) {
    const ins = await db.from(table).insert(rows);
    if (ins.error) throw new Error(`${table} insert: ${ins.error.message}`);
  }
  return rows.length;
}

// Windowed replace: refresh only the rows inside the puller's lookback window
// and keep older history untouched. Rows dated on/after `fromDate` are
// cleared and the fresh snapshot is upserted by `keyColumn`, so a shortened
// lookback never deletes records that readers (e.g. wholesale reconciliation
// against all purchase_orders) still rely on.
export async function windowedReplace(
  db: MirrorDb,
  table: string,
  dateColumn: string,
  fromDate: string,
  keyColumn: string,
  rows: unknown[],
): Promise<number> {
  const del = await db.from(table).delete().gte(dateColumn, fromDate);
  if (del.error) throw new Error(`${table} clear from ${fromDate}: ${del.error.message}`);

  if (rows.length > 0) {
    const up = await db.from(table).upsert(rows, { onConflict: keyColumn });
    if (up.error) throw new Error(`${table} upsert: ${up.error.message}`);
  }
  return rows.length;
}
