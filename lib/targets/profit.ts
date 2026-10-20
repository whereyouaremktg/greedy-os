// Pure weekly profitability math for the Q4 Targets dashboard.
//
// Inputs per week: Shopify revenue facts (net, gross, discounts, units) and
// COGS estimate from SKU unit costs, plus the manual inputs (ad spend by
// platform, 3PL cost, other opex, COGS override). Margins are null when the
// inputs they need are missing — "needs inputs" beats a fake 100%.

import { addDays, weekday } from "@/lib/targets/dates";

export type WeekFacts = {
  weekStart: string; // Monday, YYYY-MM-DD
  netSales: number;
  grossSales: number;
  discounts: number;
  orders: number;
  units: number;
  /** Units whose SKU has a unit cost on file. */
  unitsWithCost: number;
  /** Σ units × unit_cost_usd for those units. */
  cogsEstimate: number;
};

export type WeekInputs = {
  weekStart: string;
  adSpendMeta: number | null;
  adSpendTiktok: number | null;
  adSpendGoogle: number | null;
  adSpendOther: number | null;
  threeplCost: number | null;
  otherOpex: number | null;
  cogsOverride: number | null;
  notes: string | null;
};

export type WeekProfit = {
  weekStart: string;
  weekEnd: string;
  label: string;
  isCurrent: boolean;
  netSales: number;
  orders: number;
  discountRate: number | null;
  cogs: number | null;
  /** 0..1 share of units with a known unit cost (1 when overridden). */
  cogsCoverage: number;
  adSpend: number | null;
  threepl: number | null;
  otherOpex: number | null;
  grossMargin: number | null;
  contributionMargin: number | null;
  netMargin: number | null;
  /** Net sales / ad spend (marketing efficiency ratio). */
  mer: number | null;
  flags: Array<"discount" | "net_margin" | "needs_inputs">;
  hasInputs: boolean;
};

export type ProfitThresholds = {
  discountRateMaxPct: number;
  netMarginMinPct: number;
};

/** Monday on or before the given day. */
export function weekStartOf(day: string): string {
  const wd = weekday(day); // 0 = Sunday
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(day, -back);
}

function sum(...vals: Array<number | null>): number | null {
  const present = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((s, v) => s + v, 0);
}

function ratio(num: number | null, den: number): number | null {
  if (num == null || !den) return null;
  return num / den;
}

export function computeWeek(
  facts: WeekFacts,
  inputs: WeekInputs | null,
  thresholds: ProfitThresholds,
  today: string,
): WeekProfit {
  const weekEnd = addDays(facts.weekStart, 6);
  const isCurrent = today >= facts.weekStart && today <= weekEnd;

  const cogs =
    inputs?.cogsOverride != null
      ? inputs.cogsOverride
      : facts.unitsWithCost > 0
        ? facts.cogsEstimate
        : null;
  const cogsCoverage =
    inputs?.cogsOverride != null ? 1 : facts.units > 0 ? facts.unitsWithCost / facts.units : 0;

  const adSpend = inputs
    ? sum(inputs.adSpendMeta, inputs.adSpendTiktok, inputs.adSpendGoogle, inputs.adSpendOther)
    : null;
  const threepl = inputs?.threeplCost ?? null;
  const otherOpex = inputs?.otherOpex ?? null;

  const net = facts.netSales;
  const grossMargin = cogs != null && net > 0 ? (net - cogs) / net : null;
  const contributionMargin =
    cogs != null && adSpend != null && threepl != null && net > 0
      ? (net - cogs - adSpend - threepl) / net
      : null;
  const netMargin =
    contributionMargin != null && otherOpex != null && net > 0
      ? (net - cogs! - adSpend! - threepl! - otherOpex) / net
      : null;
  const mer = adSpend != null && adSpend > 0 ? net / adSpend : null;
  const discountRate = facts.grossSales > 0 ? facts.discounts / facts.grossSales : null;

  const flags: WeekProfit["flags"] = [];
  if (discountRate != null && discountRate * 100 > thresholds.discountRateMaxPct) flags.push("discount");
  if (netMargin != null && netMargin * 100 < thresholds.netMarginMinPct) flags.push("net_margin");
  if (netMargin == null && net > 0) flags.push("needs_inputs");

  return {
    weekStart: facts.weekStart,
    weekEnd,
    label: weekLabel(facts.weekStart),
    isCurrent,
    netSales: net,
    orders: facts.orders,
    discountRate,
    cogs,
    cogsCoverage,
    adSpend,
    threepl,
    otherOpex,
    grossMargin,
    contributionMargin,
    netMargin,
    mer,
    flags,
    hasInputs: inputs != null,
  };
}

export type QuarterProfit = {
  netSales: number;
  cogs: number | null;
  adSpend: number | null;
  threepl: number | null;
  otherOpex: number | null;
  grossMargin: number | null;
  contributionMargin: number | null;
  netMargin: number | null;
  mer: number | null;
  /** Weeks with complete inputs / weeks with sales. */
  weeksWithInputs: number;
  weeksWithSales: number;
};

/**
 * Quarter-to-date roll-up over the weeks that have complete inputs. Margins
 * are computed on those weeks only, so a partial quarter reads as "X of Y
 * weeks" rather than being diluted by weeks with no cost data.
 */
export function rollupQuarter(weeks: WeekProfit[]): QuarterProfit {
  const withSales = weeks.filter((w) => w.netSales > 0);
  const complete = withSales.filter((w) => w.netMargin != null);
  const net = complete.reduce((s, w) => s + w.netSales, 0);
  const cogs = complete.reduce((s, w) => s + (w.cogs ?? 0), 0);
  const ad = complete.reduce((s, w) => s + (w.adSpend ?? 0), 0);
  const tpl = complete.reduce((s, w) => s + (w.threepl ?? 0), 0);
  const opex = complete.reduce((s, w) => s + (w.otherOpex ?? 0), 0);
  const has = complete.length > 0 && net > 0;
  return {
    netSales: withSales.reduce((s, w) => s + w.netSales, 0),
    cogs: has ? cogs : null,
    adSpend: has ? ad : null,
    threepl: has ? tpl : null,
    otherOpex: has ? opex : null,
    grossMargin: has ? (net - cogs) / net : null,
    contributionMargin: has ? (net - cogs - ad - tpl) / net : null,
    netMargin: has ? (net - cogs - ad - tpl - opex) / net : null,
    mer: ratio(has && ad > 0 ? net : null, ad),
    weeksWithInputs: complete.length,
    weeksWithSales: withSales.length,
  };
}

export function weekLabel(weekStart: string): string {
  const s = new Date(`${weekStart}T00:00:00Z`);
  const e = new Date(`${addDays(weekStart, 6)}T00:00:00Z`);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(s)} – ${f(e)}`;
}
