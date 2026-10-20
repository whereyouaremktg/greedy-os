import { describe, expect, it } from "vitest";
import {
  parseWeightLb,
  resumeFrom,
  shipHeroDateToIso,
  shipmentToRow,
  syncShipHeroShipments,
  type ShipHeroShipmentNode,
  type ShipmentsDbLike,
  type ShipmentsPage,
} from "@/lib/targets/shipments-sync";

const node: ShipHeroShipmentNode = {
  id: "U2hpcG1lbnQ6MQ==",
  order_id: "T3JkZXI6MQ==",
  created_date: "2026-10-13T16:52:40",
  warehouse_id: "V2FyZWhvdXNlOjk4MTM0",
  address: { country: "US" },
  shipping_labels: [
    {
      id: "L1",
      carrier: "uni_uni",
      shipping_name: "Economy",
      shipping_method: "GROUND",
      cost: "6.59",
      status: "valid",
      tracking_number: "UUS1",
      created_date: "2026-10-13T16:52:40",
      box_name: "10x8x6",
      dimensions: { weight: "1.8000 lb" },
    },
    {
      id: "L0",
      carrier: "dhl_ecommerce",
      shipping_name: "Economy",
      shipping_method: "GROUND",
      cost: "6.10",
      status: "voided",
      tracking_number: "DHL0",
      created_date: "2026-10-13T16:40:00",
      box_name: "10x8x6",
      dimensions: { weight: "1.8000 lb" },
    },
  ],
  order: { order_number: "#73031", shop_name: "glow-beauty-hair.myshopify.com" },
};

describe("shipmentToRow", () => {
  it("sums valid labels only, keeps voided ones in the audit list", () => {
    const row = shipmentToRow(node, "America/Phoenix", "2026-10-20T00:00:00.000Z");
    expect(row.id).toBe(node.id);
    expect(row.order_number).toBe("#73031");
    expect(row.postage).toBe(6.59);
    expect(row.label_count).toBe(1);
    expect(row.carrier).toBe("uni_uni");
    expect(row.shipping_method).toBe("Economy");
    expect(row.weight_lb).toBeCloseTo(1.8);
    expect(row.created_at).toBe("2026-10-13T16:52:40.000Z");
    expect(row.day_local).toBe("2026-10-13"); // 09:52 Phoenix
    expect(row.labels).toHaveLength(2);
  });

  it("handles no labels", () => {
    const row = shipmentToRow({ ...node, shipping_labels: [] }, "America/Phoenix", "2026-10-20T00:00:00.000Z");
    expect(row.postage).toBe(0);
    expect(row.label_count).toBe(0);
    expect(row.carrier).toBeNull();
  });
});

describe("helpers", () => {
  it("parses weights", () => {
    expect(parseWeightLb("1.8000 lb")).toBeCloseTo(1.8);
    expect(parseWeightLb("16 oz")).toBeCloseTo(1);
    expect(parseWeightLb("1 kg")).toBeCloseTo(2.20462);
    expect(parseWeightLb(null)).toBeNull();
  });
  it("treats zoneless ShipHero dates as UTC", () => {
    expect(shipHeroDateToIso("2026-10-13T16:52:40")).toBe("2026-10-13T16:52:40.000Z");
    expect(shipHeroDateToIso("2026-10-13T16:52:40Z")).toBe("2026-10-13T16:52:40.000Z");
  });
  it("resumes a few days before the last synced day, clamped to the window", () => {
    const w = { key: "q4_2026", start: "2026-10-01", end: "2026-12-31" };
    expect(resumeFrom({}, w)).toBe("2026-10-01");
    expect(resumeFrom({ through: "2026-10-02" }, w)).toBe("2026-10-01");
    expect(resumeFrom({ through: "2026-10-19" }, w)).toBe("2026-10-16");
  });
});

function fakeDb() {
  const state = new Map<string, unknown>();
  const rows = new Map<string, Record<string, unknown>>();
  const runs: Array<Record<string, unknown>> = [];
  const db: ShipmentsDbLike = {
    from: (table: string) =>
      ({
        upsert: async (input: unknown[] | Record<string, unknown>) => {
          if (table === "targets_sync_state") {
            const r = input as Record<string, unknown>;
            state.set(String(r.key), r.value);
          } else {
            for (const r of input as Array<Record<string, unknown>>) rows.set(String(r.id), r);
          }
          return { error: null };
        },
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: state.has(key) ? { key, value: state.get(key) } : null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              runs.push(row);
              return { data: { id: runs.length }, error: null };
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: number) => {
            runs[id - 1] = { ...runs[id - 1], ...patch };
            return { error: null };
          },
        }),
      }) as ReturnType<ShipmentsDbLike["from"]>,
  };
  return { db, state, rows, runs };
}

function pageOf(ids: string[], hasNext: boolean, day = "2026-10-13"): ShipmentsPage {
  return {
    shipments: {
      data: {
        pageInfo: { hasNextPage: hasNext, endCursor: hasNext ? `c-${ids[ids.length - 1]}` : null },
        edges: ids.map((id) => ({ node: { ...node, id, created_date: `${day}T16:52:40`, order: { order_number: `#${id}`, shop_name: "glow-beauty-hair.myshopify.com" } } })),
      },
    },
  };
}

describe("syncShipHeroShipments", () => {
  it("pages through a window, upserts rows and marks the window complete", async () => {
    const pages = [pageOf(["1", "2"], true), pageOf(["3"], false, "2026-10-14")];
    const calls: Array<Record<string, unknown> | undefined> = [];
    const shiphero = {
      request: async <T,>(_q: string, vars?: Record<string, unknown>) => {
        calls.push(vars);
        return { data: pages.shift() as unknown as T, throttling: { user_quota: { credits_remaining: 3900, increment_rate: 60 } } };
      },
    };
    const f = fakeDb();
    const now = () => new Date("2026-10-20T15:00:00Z");
    const summary = await syncShipHeroShipments(
      { shiphero, db: f.db },
      { windows: [{ key: "q4_2026", start: "2026-10-01", end: "2026-12-31" }], budgetMs: 60_000, trigger: "manual", now },
    );
    expect(summary.shipmentsUpserted).toBe(3);
    expect(summary.pages).toBe(2);
    expect(summary.complete).toBe(true);
    expect(calls[0]?.from).toBe("2026-10-01T00:00:00");
    expect(calls[1]?.cursor).toBe("c-2");
    expect(f.rows.size).toBe(3);
    expect(f.state.get("shiphero_shipments:q4_2026")).toMatchObject({ through: "2026-10-20", complete: true });
    expect(f.runs[0]).toMatchObject({ job: "shiphero_shipments", ok: true, orders_upserted: 3, complete: true });
  });

  it("skips windows that have not started and resumes from the slack point", async () => {
    const shiphero = {
      request: async <T,>() => ({ data: pageOf(["9"], false) as unknown as T }),
    };
    const f = fakeDb();
    f.state.set("shiphero_shipments:q4_2026", { through: "2026-10-18", complete: true });
    const calls: Array<Record<string, unknown> | undefined> = [];
    const spy = { request: async <T,>(q: string, v?: Record<string, unknown>) => { calls.push(v); return shiphero.request<T>(); } };
    const summary = await syncShipHeroShipments(
      { shiphero: spy, db: f.db },
      {
        windows: [
          { key: "q4_2027", start: "2027-10-01", end: "2027-12-31" },
          { key: "q4_2026", start: "2026-10-01", end: "2026-12-31" },
        ],
        budgetMs: 60_000,
        trigger: "cron",
        now: () => new Date("2026-10-20T15:00:00Z"),
      },
    );
    expect(summary.windows[0]).toMatchObject({ key: "q4_2027", complete: true, shipments: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.from).toBe("2026-10-15T00:00:00");
  });

  it("stops at the time budget and reports partial", async () => {
    const shiphero = {
      request: async <T,>() => ({ data: pageOf(["a"], true) as unknown as T }),
    };
    const f = fakeDb();
    const summary = await syncShipHeroShipments(
      { shiphero, db: f.db },
      { windows: [{ key: "q4_2026", start: "2026-10-01", end: "2026-12-31" }], budgetMs: -1, trigger: "cron" },
    );
    expect(summary.complete).toBe(false);
    expect(summary.pages).toBe(0);
    expect(f.runs[0]).toMatchObject({ ok: true, complete: false });
  });
});
