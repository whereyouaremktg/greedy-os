// ShipHero shipments → shiphero_shipments, framework-free so it can be unit
// tested. The Next wrapper (lib/pullers/shiphero-shipments.ts) supplies the
// ShipHero request function and the service-role Supabase client.
//
// ShipHero's `shipments(date_from, date_to)` filters on created_date and has
// no updated_at, so each run re-pulls from (last synced day − SLACK_DAYS) to
// the window end and upserts by shipment id. Credits: ~1 per shipment page
// item (50 shipments ≈ 51 credits against a 4,004 bucket refilling 60/s).

import { localDay, STORE_TZ } from "@/lib/targets/dates";

export type ShipmentWindow = {
  key: string; // e.g. "q4_2026"
  /** Inclusive local start day, YYYY-MM-DD. */
  start: string;
  /** Inclusive local end day. */
  end: string;
};

export function defaultShipmentWindows(now: Date = new Date(), tz: string = STORE_TZ): ShipmentWindow[] {
  const year = Number(localDay(now, tz).slice(0, 4));
  // Current quarter first so the dashboard fills in before the baseline.
  return [
    { key: `q4_${year}`, start: `${year}-10-01`, end: `${year}-12-31` },
    { key: `q4_${year - 1}`, start: `${year - 1}-10-01`, end: `${year - 1}-12-31` },
  ];
}

export type ShipHeroLabel = {
  id: string | null;
  carrier: string | null;
  shipping_name: string | null;
  shipping_method: string | null;
  cost: string | null;
  status: string | null;
  tracking_number: string | null;
  created_date: string | null;
  box_name: string | null;
  dimensions: { weight: string | null } | null;
};

export type ShipHeroShipmentNode = {
  id: string;
  order_id: string | null;
  created_date: string; // "2026-10-13T16:52:40" (UTC, no zone)
  warehouse_id: string | null;
  address: { country: string | null } | null;
  shipping_labels: ShipHeroLabel[] | null;
  order: { order_number: string | null; shop_name: string | null } | null;
};

export type ShipmentsPage = {
  shipments: {
    data: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: ShipHeroShipmentNode }>;
    };
  };
};

export type Throttling = {
  user_quota?: { credits_remaining?: number; max_available?: number; increment_rate?: number };
};

export type ShipHeroLike = {
  request: <T>(query: string, variables?: Record<string, unknown>) => Promise<{ data: T; throttling?: Throttling }>;
};

export type ShipmentRow = {
  id: string;
  order_id: string | null;
  order_number: string | null;
  shop_name: string | null;
  created_at: string;
  day_local: string;
  warehouse_id: string | null;
  country: string | null;
  label_count: number;
  postage: number;
  carrier: string | null;
  shipping_method: string | null;
  box_name: string | null;
  weight_lb: number | null;
  labels: Array<{ carrier: string | null; method: string | null; cost: number; status: string | null; tracking: string | null }>;
  synced_at: string;
};

type WriteResult = { error: { message: string } | null };
type StateRow = { key: string; value: unknown };

export type ShipmentsDbLike = {
  from: (table: string) => {
    upsert: (rows: unknown[] | Record<string, unknown>, opts: { onConflict: string }) => Promise<WriteResult>;
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: StateRow | null; error: { message: string } | null }>;
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => { single: () => Promise<{ data: { id: number } | null; error: unknown }> };
    };
    update: (patch: Record<string, unknown>) => { eq: (col: string, val: number) => Promise<WriteResult> };
  };
};

export type ShipmentsSyncOptions = {
  windows?: ShipmentWindow[];
  budgetMs: number;
  trigger: "cron" | "manual" | "backfill";
  pageSize?: number;
  tz?: string;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type ShipmentsSyncSummary = {
  ok: true;
  runId: number | null;
  shipmentsUpserted: number;
  pages: number;
  complete: boolean;
  windows: Array<{ key: string; complete: boolean; through: string | null; shipments: number }>;
  message: string;
};

const STATE_PREFIX = "shiphero_shipments:";
/** Re-pull this many days before the last synced day to catch late labels. */
export const SLACK_DAYS = 3;
const CREDIT_FLOOR = 300;

export const SHIPMENTS_QUERY = /* GraphQL */ `
  query TargetsShipments($from: ISODateTime!, $to: ISODateTime!, $first: Int!, $cursor: String) {
    shipments(date_from: $from, date_to: $to) {
      data(first: $first, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            order_id
            created_date
            warehouse_id
            address { country }
            shipping_labels {
              id carrier shipping_name shipping_method cost status tracking_number created_date box_name
              dimensions { weight }
            }
            order { order_number shop_name }
          }
        }
      }
    }
  }
`;

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** "1.8000 lb" | "28.8 oz" | "0.82 kg" → pounds. */
export function parseWeightLb(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/^([\d.]+)\s*([a-zA-Z]*)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return null;
  const unit = m[2].toLowerCase();
  if (unit === "oz") return v / 16;
  if (unit === "kg") return v * 2.20462;
  if (unit === "g") return v / 453.592;
  return v; // lb or unitless
}

/** ShipHero dates have no zone and are UTC. */
export function shipHeroDateToIso(d: string): string {
  return /[zZ]|[+-]\d{2}:\d{2}$/.test(d) ? new Date(d).toISOString() : new Date(`${d}Z`).toISOString();
}

export function shipmentToRow(node: ShipHeroShipmentNode, tz: string, syncedAt: string): ShipmentRow {
  const createdAt = shipHeroDateToIso(node.created_date);
  const labels = (node.shipping_labels ?? []).map((l) => ({
    carrier: l.carrier,
    method: l.shipping_name ?? l.shipping_method,
    cost: num(l.cost) ?? 0,
    status: l.status,
    tracking: l.tracking_number,
  }));
  const valid = (node.shipping_labels ?? []).filter((l) => (l.status ?? "valid").toLowerCase() === "valid");
  const first = valid[0] ?? null;
  return {
    id: node.id,
    order_id: node.order_id,
    order_number: node.order?.order_number ?? null,
    shop_name: node.order?.shop_name ?? null,
    created_at: createdAt,
    day_local: localDay(createdAt, tz),
    warehouse_id: node.warehouse_id,
    country: node.address?.country ?? null,
    label_count: valid.length,
    postage: Math.round(valid.reduce((s, l) => s + (num(l.cost) ?? 0), 0) * 100) / 100,
    carrier: first?.carrier ?? null,
    shipping_method: first?.shipping_name ?? first?.shipping_method ?? null,
    box_name: first?.box_name ?? null,
    weight_lb: parseWeightLb(first?.dimensions?.weight),
    labels,
    synced_at: syncedAt,
  };
}

type WindowState = { through?: string | null; complete?: boolean; lastRunAt?: string | null };

async function readState(db: ShipmentsDbLike, key: string): Promise<WindowState> {
  const { data, error } = await db.from("targets_sync_state").select("key, value").eq("key", STATE_PREFIX + key).maybeSingle();
  if (error) throw new Error(`targets_sync_state read: ${error.message}`);
  return (data?.value as WindowState | null) ?? {};
}

async function writeState(db: ShipmentsDbLike, key: string, value: WindowState): Promise<void> {
  const { error } = await db
    .from("targets_sync_state")
    .upsert({ key: STATE_PREFIX + key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`targets_sync_state write: ${error.message}`);
}

function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resume point for a window: last synced local day minus slack, clamped to the window. */
export function resumeFrom(state: WindowState, window: ShipmentWindow): string {
  if (!state.through) return window.start;
  const back = addDaysIso(state.through, -SLACK_DAYS);
  return back < window.start ? window.start : back;
}

export async function syncShipHeroShipments(
  deps: { shiphero: ShipHeroLike; db: ShipmentsDbLike },
  opts: ShipmentsSyncOptions,
): Promise<ShipmentsSyncSummary> {
  const { shiphero, db } = deps;
  const now = opts.now ?? (() => new Date());
  const tz = opts.tz ?? STORE_TZ;
  const windows = opts.windows ?? defaultShipmentWindows(now(), tz);
  const pageSize = opts.pageSize ?? 50;
  const log = opts.log;
  const startedAt = now();
  const deadline = startedAt.getTime() + opts.budgetMs;
  const todayLocal = localDay(startedAt, tz);

  let runId: number | null = null;
  try {
    const ins = await db
      .from("targets_sync_runs")
      .insert({ job: "shiphero_shipments", trigger: opts.trigger, started_at: startedAt.toISOString() })
      .select("id")
      .single();
    runId = ins.data?.id ?? null;
  } catch {
    runId = null;
  }

  let upserted = 0;
  let pages = 0;
  let allComplete = true;
  const summaries: ShipmentsSyncSummary["windows"] = [];
  let message = "";

  try {
    for (const w of windows) {
      if (w.start > todayLocal) {
        summaries.push({ key: w.key, complete: true, through: null, shipments: 0 });
        continue;
      }
      const state = await readState(db, w.key);
      const from = resumeFrom(state, w);
      // Pull to the end of the window; ShipHero's date_to is exclusive-ish so pad a day.
      const toDay = w.end < todayLocal ? w.end : todayLocal;
      const variables = { from: `${from}T00:00:00`, to: `${addDaysIso(toDay, 1)}T23:59:59`, first: pageSize };
      log?.(`[${w.key}] shipments from ${from} to ${toDay} (through=${state.through ?? "none"})`);

      let cursor: string | null = null;
      let windowDone = false;
      let windowCount = 0;
      let maxDay: string | null = state.through ?? null;

      while (true) {
        if (now().getTime() > deadline) {
          log?.(`[${w.key}] time budget reached after ${pages} pages; will resume`);
          allComplete = false;
          break;
        }
        const res: { data: ShipmentsPage; throttling?: Throttling } = await shiphero.request<ShipmentsPage>(
          SHIPMENTS_QUERY,
          { ...variables, cursor },
        );
        const { data, throttling } = res;
        pages++;
        const page = data.shipments?.data;
        const nodes = (page?.edges ?? []).map((e) => e.node);
        if (nodes.length > 0) {
          const syncedAt = now().toISOString();
          const rows = nodes.map((n) => shipmentToRow(n, tz, syncedAt));
          const up = await db.from("shiphero_shipments").upsert(rows, { onConflict: "id" });
          if (up.error) throw new Error(`shiphero_shipments upsert: ${up.error.message}`);
          upserted += rows.length;
          windowCount += rows.length;
          for (const r of rows) if (!maxDay || r.day_local > maxDay) maxDay = r.day_local;
          // Progress is only safe to persist once a page is fully written.
          await writeState(db, w.key, { through: maxDay, complete: state.complete ?? false, lastRunAt: syncedAt });
        }
        if (!page?.pageInfo?.hasNextPage || !page.pageInfo.endCursor) {
          windowDone = true;
          break;
        }
        cursor = page.pageInfo.endCursor;

        const q = throttling?.user_quota;
        if (q?.credits_remaining != null && q.credits_remaining < CREDIT_FLOOR) {
          const rate = q.increment_rate && q.increment_rate > 0 ? q.increment_rate : 60;
          const wait = Math.min(30, Math.ceil((CREDIT_FLOOR - q.credits_remaining) / rate));
          log?.(`[${w.key}] credits low (${q.credits_remaining}); waiting ${wait}s`);
          await sleep(wait * 1000);
        }
      }

      if (windowDone) {
        // Everything through today is in; the next run re-pulls the slack days only.
        await writeState(db, w.key, { through: toDay, complete: true, lastRunAt: now().toISOString() });
        maxDay = toDay;
      }
      summaries.push({ key: w.key, complete: windowDone, through: maxDay, shipments: windowCount });
      log?.(`[${w.key}] ${windowDone ? "complete" : "partial"} — ${windowCount} shipments`);
      if (!windowDone) break;
    }
    message = summaries.map((s) => `${s.key}: ${s.shipments} shipments${s.complete ? "" : " (partial)"}`).join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId != null) {
      await db
        .from("targets_sync_runs")
        .update({ finished_at: now().toISOString(), ok: false, orders_upserted: upserted, pages, complete: false, message: msg.slice(0, 2000) })
        .eq("id", runId);
    }
    throw err;
  }

  if (runId != null) {
    await db
      .from("targets_sync_runs")
      .update({ finished_at: now().toISOString(), ok: true, orders_upserted: upserted, pages, complete: allComplete, message })
      .eq("id", runId);
  }
  return { ok: true, runId, shipmentsUpserted: upserted, pages, complete: allComplete, windows: summaries, message };
}
