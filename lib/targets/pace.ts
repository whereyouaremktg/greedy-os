// Pure pace / projection math for the Q4 goal tiers.
//
// Two projections are shown side by side:
//   linear  — to-date revenue scaled by days elapsed over the full quarter.
//   curve   — to-date revenue divided by the share of last year's Q4 revenue
//             that had landed by the same point in the quarter. This is the
//             "BFCM-weighted" projection: it knows November's second half and
//             early December carry most of the quarter.

import { daysBetween, eachDay } from "@/lib/targets/dates";

export type Tier = { key: string; label: string; amount: number };

export type DailyPoint = { day: string; value: number };

export type PaceResult = {
  toDate: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  /** Linear projection for the full quarter. */
  linearProjection: number;
  /** Curve-weighted projection; null when no baseline curve exists. */
  curveProjection: number | null;
  /** Share (0..1) of last year's quarter that had landed by this day-of-quarter. */
  baselineShareToDate: number | null;
  /** Last year's total for the same window (used for YoY). */
  baselineTotal: number | null;
  /** Last year's to-date total at the same day-of-quarter. */
  baselineToDate: number | null;
};

/**
 * Compute projections. `today` is the last fully/partially counted local day;
 * `current` holds daily totals for the current quarter, `baseline` for last
 * year's quarter (same day-of-quarter alignment: day index i maps to i).
 */
export function computePace(opts: {
  start: string;
  end: string;
  today: string;
  current: DailyPoint[];
  baseline: DailyPoint[] | null;
  /** Baseline window start, to align by day-of-quarter. */
  baselineStart?: string;
}): PaceResult {
  const { start, end, today, current, baseline } = opts;
  const daysTotal = daysBetween(start, end) + 1;
  const clampedToday = today < start ? start : today > end ? end : today;
  const daysElapsed = Math.max(0, Math.min(daysTotal, daysBetween(start, clampedToday) + 1));
  const daysRemaining = daysTotal - daysElapsed;

  const toDate = current
    .filter((p) => p.day >= start && p.day <= clampedToday)
    .reduce((s, p) => s + p.value, 0);

  const linearProjection =
    daysElapsed > 0 ? (toDate / daysElapsed) * daysTotal : 0;

  let curveProjection: number | null = null;
  let baselineShareToDate: number | null = null;
  let baselineTotal: number | null = null;
  let baselineToDate: number | null = null;

  if (baseline && baseline.length > 0) {
    const bStart = opts.baselineStart ?? inferStart(baseline);
    const bDays = eachDay(bStart, addDaysStr(bStart, daysTotal - 1));
    const byDay = new Map(baseline.map((p) => [p.day, p.value]));
    const series = bDays.map((d) => byDay.get(d) ?? 0);
    baselineTotal = series.reduce((s, v) => s + v, 0);
    baselineToDate = series.slice(0, daysElapsed).reduce((s, v) => s + v, 0);
    if (baselineTotal > 0) {
      baselineShareToDate = baselineToDate / baselineTotal;
      curveProjection =
        baselineShareToDate > 0 ? toDate / baselineShareToDate : null;
    }
  }

  return {
    toDate,
    daysElapsed,
    daysTotal,
    daysRemaining,
    linearProjection,
    curveProjection,
    baselineShareToDate,
    baselineTotal,
    baselineToDate,
  };
}

function inferStart(points: DailyPoint[]): string {
  return points.reduce((min, p) => (p.day < min ? p.day : min), points[0].day);
}

function addDaysStr(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type TierProgress = Tier & {
  /** 0..1 share of the tier reached to date. */
  progress: number;
  /** Gap left to the tier (>= 0). */
  gap: number;
  /** Whether the curve projection (or linear when absent) clears the tier. */
  onPace: boolean;
  /** Required average per remaining day to hit the tier. */
  requiredPerDay: number | null;
};

export function tierProgress(
  tiers: Tier[],
  pace: PaceResult,
): TierProgress[] {
  const projection = pace.curveProjection ?? pace.linearProjection;
  return tiers.map((t) => {
    const gap = Math.max(0, t.amount - pace.toDate);
    return {
      ...t,
      progress: t.amount > 0 ? Math.min(1, pace.toDate / t.amount) : 0,
      gap,
      onPace: projection >= t.amount,
      requiredPerDay:
        pace.daysRemaining > 0 ? gap / pace.daysRemaining : gap > 0 ? null : 0,
    };
  });
}

/** Position (0..1) of a value on a bar whose right edge is `max`. */
export function barPosition(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}
