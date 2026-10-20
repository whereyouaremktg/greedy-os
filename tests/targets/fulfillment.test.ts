import { describe, expect, it } from "vitest";
import {
  computeFulfillmentWeek,
  rollupFulfillment,
  threeplFallback,
  type FulfillmentRates,
  type FulfillmentWeekFacts,
} from "@/lib/targets/fulfillment";

const facts: FulfillmentWeekFacts = {
  weekStart: "2026-10-05",
  orders: 200,
  units: 320,
  netSales: 10_000,
  shippingCharged: 600,
  shippedOrders: 180,
  shipments: 182,
  postage: 1_260, // $7.00 per shipped order
  avgHoursToShip: 20,
  p50HoursToShip: 14,
};

const noRates: FulfillmentRates = { pick_pack_per_order: null, pick_pack_per_extra_unit: null, packaging_per_order: null };
const rates: FulfillmentRates = { pick_pack_per_order: 2.5, pick_pack_per_extra_unit: 0.5, packaging_per_order: 0.75 };

describe("computeFulfillmentWeek", () => {
  it("extrapolates postage to all orders at the matched rate", () => {
    const w = computeFulfillmentWeek(facts, noRates, "2026-10-20");
    expect(w.matchRate).toBeCloseTo(0.9);
    expect(w.postagePerOrder).toBeCloseTo(7);
    expect(w.postageEstimated).toBeCloseTo(1_400);
    expect(w.isEstimate).toBe(true);
    expect(w.pickPack).toBeNull();
    expect(w.packaging).toBeNull();
    // Postage only: still a fulfillment cost, flagged as missing the rest.
    expect(w.fulfillmentCost).toBeCloseTo(1_400);
    expect(w.missing).toEqual(["pick_pack", "packaging"]);
    expect(w.netShipping).toBeCloseTo(-800);
    expect(w.shippingRecovery).toBeCloseTo(600 / 1_400);
    expect(w.isCurrent).toBe(false);
  });

  it("adds pick/pack (first unit included) and packaging from the rate card", () => {
    const w = computeFulfillmentWeek(facts, rates, "2026-10-07");
    expect(w.pickPack).toBeCloseTo(200 * 2.5 + 120 * 0.5); // 560
    expect(w.packaging).toBeCloseTo(150);
    expect(w.fulfillmentCost).toBeCloseTo(1_400 + 560 + 150);
    expect(w.fulfillmentPerOrder).toBeCloseTo(2_110 / 200);
    expect(w.fulfillmentPctOfNet).toBeCloseTo(0.211);
    expect(w.missing).toEqual([]);
    expect(w.isCurrent).toBe(true);
  });

  it("refuses to extrapolate from a thin match", () => {
    const w = computeFulfillmentWeek({ ...facts, shippedOrders: 40, postage: 280 }, rates, "2026-10-20");
    expect(w.postagePerOrder).toBeCloseTo(7);
    expect(w.postageEstimated).toBeNull();
    expect(w.fulfillmentCost).toBeNull();
    expect(w.missing).toContain("postage");
    expect(threeplFallback(w)).toBeNull();
  });

  it("is all-null with no orders", () => {
    const w = computeFulfillmentWeek({ ...facts, orders: 0, units: 0, shippedOrders: 0, shipments: 0, postage: 0, netSales: 0 }, rates, "2026-10-20");
    expect(w.postagePerOrder).toBeNull();
    expect(w.fulfillmentCost).toBeNull();
    expect(w.pickPack).toBeNull();
  });

  it("threeplFallback prefers the full estimate, then postage", () => {
    expect(threeplFallback(computeFulfillmentWeek(facts, rates, "2026-10-20"))).toBeCloseTo(2_110);
    expect(threeplFallback(computeFulfillmentWeek(facts, noRates, "2026-10-20"))).toBeCloseTo(1_400);
  });
});

describe("rollupFulfillment", () => {
  it("computes per-order figures on totals and weights ship time by orders", () => {
    const w1 = computeFulfillmentWeek(facts, rates, "2026-10-20");
    const w2 = computeFulfillmentWeek(
      { ...facts, weekStart: "2026-10-12", orders: 100, units: 100, netSales: 4_000, shippedOrders: 100, shipments: 100, postage: 500, shippingCharged: 100, avgHoursToShip: 50, p50HoursToShip: 44 },
      rates,
      "2026-10-20",
    );
    const q = rollupFulfillment([w1, w2]);
    expect(q.orders).toBe(300);
    expect(q.shippedOrders).toBe(280);
    expect(q.postagePerOrder).toBeCloseTo(1_760 / 280);
    expect(q.postageEstimated).toBeCloseTo((1_760 / 280) * 300);
    expect(q.pickPack).toBeCloseTo(560 + 250);
    expect(q.packaging).toBeCloseTo(150 + 75);
    expect(q.avgHoursToShip).toBeCloseTo((20 * 200 + 50 * 100) / 300);
    expect(q.weeksWithPostage).toBe(2);
    expect(q.weeksWithOrders).toBe(2);
    expect(q.missing).toEqual([]);
  });

  it("stays null-safe when nothing is matched", () => {
    const w = computeFulfillmentWeek({ ...facts, shippedOrders: 0, shipments: 0, postage: 0 }, noRates, "2026-10-20");
    const q = rollupFulfillment([w]);
    expect(q.postagePerOrder).toBeNull();
    expect(q.fulfillmentCost).toBeNull();
    expect(q.missing).toEqual(["postage", "pick_pack", "packaging"]);
  });
});
