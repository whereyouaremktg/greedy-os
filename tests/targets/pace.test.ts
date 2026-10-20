import { describe, expect, it } from "vitest";
import { computePace, tierProgress } from "@/lib/targets/pace";
import {
  addDays,
  daysBetween,
  localDay,
  q4Window,
  sameWeekdayLastYear,
  startOfLocalDayUtc,
  weekday,
} from "@/lib/targets/dates";

describe("dates", () => {
  it("buckets instants into store-local days (America/Phoenix, UTC-7)", () => {
    expect(localDay("2026-10-01T06:59:59Z")).toBe("2026-09-30");
    expect(localDay("2026-10-01T07:00:00Z")).toBe("2026-10-01");
    expect(localDay("2026-12-31T23:30:00Z")).toBe("2026-12-31");
  });

  it("computes the Q4 window in UTC from local days", () => {
    const w = q4Window(2026);
    expect(w.start).toBe("2026-10-01");
    expect(w.end).toBe("2026-12-31");
    expect(w.startUtc).toBe("2026-10-01T07:00:00.000Z");
    expect(w.endUtcExclusive).toBe("2027-01-01T07:00:00.000Z");
  });

  it("handles a DST zone when asked", () => {
    // New York: EDT in October (UTC-4), EST in December (UTC-5).
    expect(startOfLocalDayUtc("2026-10-01", "America/New_York").toISOString()).toBe(
      "2026-10-01T04:00:00.000Z",
    );
    expect(startOfLocalDayUtc("2026-12-01", "America/New_York").toISOString()).toBe(
      "2026-12-01T05:00:00.000Z",
    );
  });

  it("finds the same weekday last year 364 days back", () => {
    expect(sameWeekdayLastYear("2026-11-27")).toBe("2025-11-28");
    expect(weekday("2026-11-27")).toBe(weekday("2025-11-28"));
    expect(sameWeekdayLastYear("2026-11-24")).toBe("2025-11-25");
  });

  it("does day arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-01", "2026-12-31")).toBe(91);
  });
});

describe("computePace", () => {
  const start = "2026-10-01";
  const end = "2026-12-31";

  it("projects linearly when there is no baseline", () => {
    const current = [
      { day: "2026-10-01", value: 100 },
      { day: "2026-10-02", value: 100 },
    ];
    const p = computePace({ start, end, today: "2026-10-02", current, baseline: null });
    expect(p.toDate).toBe(200);
    expect(p.daysElapsed).toBe(2);
    expect(p.daysTotal).toBe(92);
    expect(p.daysRemaining).toBe(90);
    expect(p.linearProjection).toBeCloseTo(9200);
    expect(p.curveProjection).toBeNull();
  });

  it("weights the projection by last year's curve", () => {
    // Baseline: 10/day for 91 days then 1000 on the last day (a BFCM-like spike).
    const baseline = Array.from({ length: 92 }, (_, i) => ({
      day: addDays("2025-10-01", i),
      value: i === 91 ? 1000 : 10,
    }));
    const current = [{ day: "2026-10-01", value: 20 }];
    const p = computePace({
      start,
      end,
      today: "2026-10-01",
      current,
      baseline,
      baselineStart: "2025-10-01",
    });
    expect(p.baselineTotal).toBe(910 + 1000);
    expect(p.baselineToDate).toBe(10);
    expect(p.baselineShareToDate).toBeCloseTo(10 / 1910);
    // 20 to date at a point where LY had landed 10/1910 of the quarter.
    expect(p.curveProjection).toBeCloseTo(20 / (10 / 1910));
    // Linear ignores the spike and under-projects.
    expect(p.linearProjection).toBeCloseTo(20 * 92);
  });

  it("ignores days outside the window and clamps today", () => {
    const current = [
      { day: "2026-09-30", value: 999 },
      { day: "2026-10-01", value: 5 },
      { day: "2027-01-02", value: 999 },
    ];
    const p = computePace({ start, end, today: "2027-01-15", current, baseline: null });
    expect(p.toDate).toBe(5);
    expect(p.daysElapsed).toBe(92);
    expect(p.daysRemaining).toBe(0);
  });
});

describe("tierProgress", () => {
  it("reports progress, gap, pace and required run-rate per tier", () => {
    const tiers = [
      { key: "plan", label: "Plan", amount: 1000 },
      { key: "crush", label: "Crush", amount: 2000 },
    ];
    const pace = computePace({
      start: "2026-10-01",
      end: "2026-12-31",
      today: "2026-10-23",
      current: [{ day: "2026-10-10", value: 500 }],
      baseline: null,
    });
    const [plan, crush] = tierProgress(tiers, pace);
    expect(plan.progress).toBe(0.5);
    expect(plan.gap).toBe(500);
    expect(plan.requiredPerDay).toBeCloseTo(500 / 69);
    expect(plan.onPace).toBe(true); // linear: 500/23*92 = 2000
    expect(crush.onPace).toBe(true);
    expect(crush.gap).toBe(1500);
  });
});
