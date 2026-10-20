import { describe, expect, it } from "vitest";
import { computeWeek, rollupQuarter, weekStartOf, type WeekFacts, type WeekInputs } from "@/lib/targets/profit";

const thresholds = { discountRateMaxPct: 10, netMarginMinPct: 25 };

const facts: WeekFacts = {
  weekStart: "2026-10-05",
  netSales: 10_000,
  grossSales: 11_000,
  discounts: 1_000,
  orders: 200,
  units: 300,
  unitsWithCost: 300,
  cogsEstimate: 3_000,
};

const inputs: WeekInputs = {
  weekStart: "2026-10-05",
  adSpendMeta: 1_500,
  adSpendTiktok: 500,
  adSpendGoogle: null,
  adSpendOther: null,
  threeplCost: 800,
  otherOpex: 1_200,
  cogsOverride: null,
  notes: null,
};

describe("weekStartOf", () => {
  it("snaps to the Monday on or before", () => {
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28"); // Thursday
    expect(weekStartOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // Sunday
  });
});

describe("computeWeek", () => {
  it("computes margins and MER from facts + inputs", () => {
    const w = computeWeek(facts, inputs, thresholds, "2026-10-20");
    expect(w.cogs).toBe(3_000);
    expect(w.adSpend).toBe(2_000);
    expect(w.grossMargin).toBeCloseTo(0.7);
    expect(w.contributionMargin).toBeCloseTo((10_000 - 3_000 - 2_000 - 800) / 10_000);
    expect(w.netMargin).toBeCloseTo((10_000 - 3_000 - 2_000 - 800 - 1_200) / 10_000);
    expect(w.mer).toBeCloseTo(5);
    expect(w.discountRate).toBeCloseTo(1_000 / 11_000);
    expect(w.flags).toEqual([]);
    expect(w.isCurrent).toBe(false);
  });

  it("flags high discount rate and low net margin", () => {
    const w = computeWeek(
      { ...facts, discounts: 2_000, grossSales: 12_000 },
      { ...inputs, otherOpex: 3_500 },
      thresholds,
      "2026-10-20",
    );
    expect(w.flags).toContain("discount");
    expect(w.flags).toContain("net_margin");
  });

  it("reports needs_inputs instead of inventing margins", () => {
    const w = computeWeek(facts, null, thresholds, "2026-10-20");
    expect(w.grossMargin).toBeCloseTo(0.7); // COGS from SKU costs still works
    expect(w.contributionMargin).toBeNull();
    expect(w.netMargin).toBeNull();
    expect(w.mer).toBeNull();
    expect(w.flags).toEqual(["needs_inputs"]);
  });

  it("uses the COGS override and reports partial cost coverage", () => {
    const partial = computeWeek({ ...facts, unitsWithCost: 150, cogsEstimate: 1_500 }, null, thresholds, "2026-10-20");
    expect(partial.cogsCoverage).toBeCloseTo(0.5);
    expect(partial.cogs).toBe(1_500);
    const overridden = computeWeek(facts, { ...inputs, cogsOverride: 4_000 }, thresholds, "2026-10-20");
    expect(overridden.cogs).toBe(4_000);
    expect(overridden.cogsCoverage).toBe(1);
  });
});

describe("rollupQuarter", () => {
  it("rolls up only weeks with complete inputs and counts coverage", () => {
    const a = computeWeek(facts, inputs, thresholds, "2026-10-20");
    const b = computeWeek({ ...facts, weekStart: "2026-10-12" }, null, thresholds, "2026-10-20");
    const q = rollupQuarter([a, b]);
    expect(q.weeksWithSales).toBe(2);
    expect(q.weeksWithInputs).toBe(1);
    expect(q.netSales).toBe(20_000);
    expect(q.netMargin).toBeCloseTo(a.netMargin as number);
    expect(q.mer).toBeCloseTo(5);
  });
});
