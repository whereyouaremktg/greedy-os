// Growth-aware inventory forecast — deterministic engine.
//
// This module is the spec from Glow's hand-built "Inventory Forecast" PDF turned
// into code: it projects per-SKU demand forward using (a) a recent run rate,
// (b) per-SKU YoY growth, and (c) a seasonality curve, then crosses that demand
// against on-hand + incoming supply to find the runout date. Manufacturing lead
// time gates that into an order-by date and an urgency status, and a coverage
// horizon sizes the reorder quantity.
//
// IMPORTANT: every number here is computed deterministically — no model, no
// guessing. Claude only *narrates* the output elsewhere. These numbers drive
// real PO spend, so they must be auditable and reproducible.

// ---------------------------------------------------------------------------
// Types — these double as the contract for the data-loading layer and surfaces.
// ---------------------------------------------------------------------------

export type MonthlySales = {
  /** First day of the month, "YYYY-MM-01". */
  month: string;
  units: number;
};

export type IncomingReceipt = {
  /** Expected arrival date, ISO "YYYY-MM-DD". */
  arrivalDate: string;
  qty: number;
};

export type ForecastInput = {
  sku: string;
  productTitle: string;
  /** Current sellable on-hand (Shopify now; Retroship when wired). */
  onHand: number;
  /** Open manufacturing/POs not yet received. */
  incoming: IncomingReceipt[];
  /** Monthly unit sales, oldest→newest; ideally 12-24 months. */
  history: MonthlySales[];
  /** Manufacturing lead time in days (vendor avg, or a default). */
  leadTimeDays: number;
};

export type ForecastConfig = {
  /** Evaluation date. */
  asOf: Date;
  /**
   * How far past the next reorder's arrival to keep covered, in days. The
   * reorder qty is sized to satisfy demand through asOf + leadTime + this.
   * Default ~7 months reaches through the following Q1 from a mid-year order.
   */
  coverWindowDays?: number;
  /** "Order this week" if order-by date is within this many days. */
  orderNowWindowDays?: number;
  /** "Order soon" if order-by date is within this many days. */
  orderSoonWindowDays?: number;
  /** Below this YoY growth, treat as a demand problem (don't recommend reorder). */
  demandDownThreshold?: number;
  /** Clamp YoY growth into [−cap, +cap] so noisy SKUs don't explode. */
  growthCap?: number;
};

export type ForecastStatus =
  | "order_now"
  | "order_soon"
  | "watch"
  | "comfortable"
  | "demand_down"
  | "insufficient_data";

export type SkuForecast = {
  sku: string;
  productTitle: string;
  onHand: number;
  incomingUnits: number;
  /** Trailing run rate used as the projection base (units/month). */
  baseMonthlyRunRate: number;
  /** Per-SKU YoY growth as a fraction (0.42 = +42%), clamped. */
  yoyGrowth: number | null;
  /** Months of forward cover at the projected (seasonal, growth-adj) demand. */
  monthsOfCover: number | null;
  /** Projected runout date, or null if covered beyond the projection horizon. */
  stockoutDate: string | null;
  /** stockoutDate − leadTime: the last safe day to place a reorder. */
  orderByDate: string | null;
  status: ForecastStatus;
  /** Recommended reorder units (0 when none needed / demand down). */
  reorderQty: number;
  /** Short machine reasons; the narrator turns these into prose. */
  reasons: string[];
};

const DEFAULTS = {
  coverWindowDays: 210,
  orderNowWindowDays: 7,
  orderSoonWindowDays: 30,
  demandDownThreshold: -0.05,
  growthCap: 1.5,
  /** Months to project forward before giving up and calling it "comfortable". */
  horizonMonths: 18,
  /** Recent months averaged for the base run rate. */
  runRateMonths: 3,
} as const;

// ---------------------------------------------------------------------------
// Date helpers (UTC, month-grain).
// ---------------------------------------------------------------------------

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Building blocks.
// ---------------------------------------------------------------------------

/**
 * Seasonality index by calendar month (1-12). index[m] = average units in
 * month m ÷ average units across all months. A value of 1.6 means "this month
 * runs 60% hotter than the SKU's average month." Returns a flat curve (all 1s)
 * when there isn't a full year of history.
 */
export function seasonalityIndex(history: MonthlySales[]): Map<number, number> {
  const flat = new Map<number, number>();
  for (let m = 1; m <= 12; m++) flat.set(m, 1);
  if (history.length < 12) return flat;

  const byMonth = new Map<number, number[]>();
  for (const h of history) {
    const m = new Date(`${h.month}T00:00:00Z`).getUTCMonth() + 1;
    const arr = byMonth.get(m) ?? [];
    arr.push(h.units);
    byMonth.set(m, arr);
  }

  const monthAvg = new Map<number, number>();
  let sum = 0;
  let count = 0;
  for (let m = 1; m <= 12; m++) {
    const arr = byMonth.get(m);
    const avg = arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    monthAvg.set(m, avg);
    sum += avg;
    count += 1;
  }
  const overallAvg = count ? sum / count : 0;
  if (overallAvg <= 0) return flat;

  const idx = new Map<number, number>();
  for (let m = 1; m <= 12; m++) {
    idx.set(m, (monthAvg.get(m) ?? 0) / overallAvg);
  }
  return idx;
}

/**
 * Per-SKU YoY growth as a fraction. Compares the trailing 12 months to the
 * prior 12 months when ≥24 months exist; otherwise compares the most recent
 * months to the same months a year earlier. Returns null if it can't be
 * computed. Clamped to ±growthCap.
 */
export function yoyGrowth(
  history: MonthlySales[],
  growthCap: number,
): number | null {
  if (history.length < 13) return null;
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));

  // Pair each recent month with the same month one year prior.
  const unitsByMonth = new Map(sorted.map((h) => [h.month, h.units]));
  const recent = sorted.slice(-12);
  let curr = 0;
  let prior = 0;
  let paired = 0;
  for (const h of recent) {
    const d = new Date(`${h.month}T00:00:00Z`);
    const priorKey = monthKey(addMonths(d, -12));
    const priorUnits = unitsByMonth.get(priorKey);
    if (priorUnits === undefined) continue;
    curr += h.units;
    prior += priorUnits;
    paired += 1;
  }
  if (paired < 6 || prior <= 0) return null;
  const g = curr / prior - 1;
  return Math.max(-growthCap, Math.min(growthCap, g));
}

/** Average monthly units over the most recent `months`, ignoring empty tail. */
export function baseRunRate(history: MonthlySales[], months: number): number {
  if (history.length === 0) return 0;
  const sorted = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const recent = sorted.slice(-months);
  if (recent.length === 0) return 0;
  const total = recent.reduce((a, b) => a + b.units, 0);
  return total / recent.length;
}

/**
 * Expected demand for a given future month, applying seasonality and growth.
 * `monthsAhead` is months from asOf; growth compounds annually over that span.
 */
function projectedMonthDemand(
  base: number,
  growth: number,
  index: Map<number, number>,
  targetMonth: Date,
  monthsAhead: number,
): number {
  const seasonal = index.get(targetMonth.getUTCMonth() + 1) ?? 1;
  const growthFactor = Math.pow(1 + growth, monthsAhead / 12);
  return base * seasonal * growthFactor;
}

// ---------------------------------------------------------------------------
// Core forecast.
// ---------------------------------------------------------------------------

export function forecastSku(
  input: ForecastInput,
  config: ForecastConfig,
): SkuForecast {
  const cfg = { ...DEFAULTS, ...config };
  const reasons: string[] = [];

  const incomingUnits = input.incoming.reduce((a, r) => a + r.qty, 0);
  const base = baseRunRate(input.history, cfg.runRateMonths);
  const growthRaw = yoyGrowth(input.history, cfg.growthCap);
  const growth = growthRaw ?? 0;
  const index = seasonalityIndex(input.history);

  // Not enough signal to forecast demand.
  if (input.history.length < 3 || base <= 0) {
    return {
      sku: input.sku,
      productTitle: input.productTitle,
      onHand: input.onHand,
      incomingUnits,
      baseMonthlyRunRate: base,
      yoyGrowth: growthRaw,
      monthsOfCover: null,
      stockoutDate: null,
      orderByDate: null,
      status: "insufficient_data",
      reorderQty: 0,
      reasons: ["not enough sales history to forecast demand"],
    };
  }

  // Walk forward month by month, drawing down supply as seasonal+growth demand
  // accrues and adding receipts as they arrive. Find the day supply hits zero.
  const incomingByMonth = new Map<string, number>();
  for (const r of input.incoming) {
    const k = monthKey(new Date(`${r.arrivalDate}T00:00:00Z`));
    incomingByMonth.set(k, (incomingByMonth.get(k) ?? 0) + r.qty);
  }

  let supply = input.onHand;
  let stockout: Date | null = null;
  const monthStart = new Date(
    Date.UTC(cfg.asOf.getUTCFullYear(), cfg.asOf.getUTCMonth(), 1),
  );

  for (let i = 0; i < cfg.horizonMonths; i++) {
    const m = addMonths(monthStart, i);
    // Receipts land at the start of their arrival month.
    supply += incomingByMonth.get(monthKey(m)) ?? 0;

    const demand = projectedMonthDemand(base, growth, index, m, i);
    // Prorate the first (partial) month from asOf to month end.
    let monthDemand = demand;
    if (i === 0) {
      const monthEnd = addMonths(m, 1);
      const totalDays = daysBetween(m, monthEnd);
      const remainingDays = Math.max(0, daysBetween(cfg.asOf, monthEnd));
      monthDemand = demand * (remainingDays / totalDays);
    }

    if (monthDemand > 0 && supply - monthDemand < 0) {
      // Interpolate the day within the month supply runs out.
      const dailyDemand = monthDemand / daysBetween(m, addMonths(m, 1));
      const startRef = i === 0 ? cfg.asOf : m;
      const daysUntilZero = supply / Math.max(dailyDemand, 1e-9);
      stockout = new Date(startRef.getTime() + daysUntilZero * 86_400_000);
      break;
    }
    supply -= monthDemand;
  }

  const monthsOfCover = stockout
    ? Math.round((daysBetween(cfg.asOf, stockout) / 30.44) * 10) / 10
    : null;

  const orderBy = stockout
    ? new Date(stockout.getTime() - input.leadTimeDays * 86_400_000)
    : null;

  // Status.
  let status: ForecastStatus;
  if (growthRaw !== null && growthRaw < cfg.demandDownThreshold) {
    status = "demand_down";
    reasons.push(
      `demand down ${Math.round(growthRaw * 100)}% YoY — supply is fine, this is a demand question`,
    );
  } else if (!stockout) {
    status = "comfortable";
    reasons.push(`covered beyond the ${cfg.horizonMonths}-month horizon`);
  } else {
    const daysToOrderBy = orderBy ? daysBetween(cfg.asOf, orderBy) : Infinity;
    if (daysToOrderBy <= cfg.orderNowWindowDays) {
      status = "order_now";
      reasons.push(
        `runs out ~${isoDate(stockout)}; with a ${input.leadTimeDays}-day lead time you must order now`,
      );
    } else if (daysToOrderBy <= cfg.orderSoonWindowDays) {
      status = "order_soon";
      reasons.push(`order within ${cfg.orderSoonWindowDays} days to avoid a gap`);
    } else {
      status = "watch";
      reasons.push(`on track; reorder by ~${orderBy ? isoDate(orderBy) : "n/a"}`);
    }
  }
  if (growthRaw !== null && growthRaw > 0.1 && status !== "demand_down") {
    reasons.push(`growing +${Math.round(growthRaw * 100)}% YoY`);
  }

  // Reorder quantity: demand from the next order's arrival through the cover
  // window, minus what's already on-hand + incoming. Zero for demand-down.
  let reorderQty = 0;
  if (status !== "demand_down" && status !== "comfortable") {
    const arrival = orderBy
      ? new Date(orderBy.getTime() + input.leadTimeDays * 86_400_000)
      : addMonths(cfg.asOf, Math.round(input.leadTimeDays / 30.44));
    const coverEnd = new Date(arrival.getTime() + cfg.coverWindowDays * 86_400_000);
    const demandToCover = demandBetween(base, growth, index, cfg.asOf, coverEnd);
    reorderQty = Math.max(
      0,
      Math.ceil(demandToCover - input.onHand - incomingUnits),
    );
  }

  return {
    sku: input.sku,
    productTitle: input.productTitle,
    onHand: input.onHand,
    incomingUnits,
    baseMonthlyRunRate: Math.round(base * 10) / 10,
    yoyGrowth: growthRaw,
    monthsOfCover,
    stockoutDate: stockout ? isoDate(stockout) : null,
    orderByDate: orderBy ? isoDate(orderBy) : null,
    status,
    reorderQty,
    reasons,
  };
}

/** Total projected demand between two dates (seasonality + growth applied). */
function demandBetween(
  base: number,
  growth: number,
  index: Map<number, number>,
  from: Date,
  to: Date,
): number {
  if (to <= from) return 0;
  let total = 0;
  const firstMonth = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  for (let i = 0; i < 36; i++) {
    const m = addMonths(firstMonth, i);
    const mEnd = addMonths(m, 1);
    if (m >= to) break;
    const monthsAhead = Math.max(
      0,
      (m.getUTCFullYear() - from.getUTCFullYear()) * 12 +
        (m.getUTCMonth() - from.getUTCMonth()),
    );
    const full = projectedMonthDemand(base, growth, index, m, monthsAhead);
    // Clip the first and last partial months to the [from, to] window.
    const winStart = m < from ? from : m;
    const winEnd = mEnd > to ? to : mEnd;
    const frac = daysBetween(winStart, winEnd) / daysBetween(m, mEnd);
    total += full * Math.max(0, Math.min(1, frac));
  }
  return total;
}

/** Convenience: forecast a batch and sort most-urgent-first. */
export function forecastAll(
  inputs: ForecastInput[],
  config: ForecastConfig,
): SkuForecast[] {
  const order: Record<ForecastStatus, number> = {
    order_now: 0,
    order_soon: 1,
    watch: 2,
    demand_down: 3,
    comfortable: 4,
    insufficient_data: 5,
  };
  return inputs
    .map((i) => forecastSku(i, config))
    .sort((a, b) => {
      const s = order[a.status] - order[b.status];
      if (s !== 0) return s;
      return (a.monthsOfCover ?? 999) - (b.monthsOfCover ?? 999);
    });
}
