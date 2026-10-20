// Read model for the Q4 Targets dashboard. Server-only: runs under the
// cookie-bound Supabase client (RLS applies) and returns one serializable
// TargetsData object for the client view.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import {
  BUCKET_LABELS,
  MARKETPLACE_BUCKETS,
  REVENUE_BUCKETS,
  type Bucket,
  type RevenueBucket,
} from "@/lib/targets/classify";
import {
  addDays,
  eachDay,
  sameWeekdayLastYear,
  startOfLocalDayUtc,
  todayLocal,
  weekday,
} from "@/lib/targets/dates";
import { computePace, tierProgress, type PaceResult, type TierProgress } from "@/lib/targets/pace";
import {
  parseTargetsSettings,
  TARGETS_SETTINGS_KEY,
  type TargetsSettings,
} from "@/lib/targets/settings";
import { getWholesaleSummary, type WholesaleSummary } from "@/lib/targets/wholesale";
import { getProfitability, type ProfitabilityData } from "@/lib/targets/profitability";
import { getLaunches, type LaunchesData } from "@/lib/targets/launches";

type DB = SupabaseClient<Database>;

export type SectionTotals = {
  orders: number;
  netSales: number;
  grossSales: number;
  discounts: number;
  returns: number;
  units: number;
  aov: number | null;
  /** discounts / gross, 0..1 */
  discountRate: number | null;
};

export type Compared = {
  current: SectionTotals;
  /** Same day-of-quarter window last year. */
  lastYear: SectionTotals;
  /** Full last-year quarter, for context. */
  lastYearFull: SectionTotals;
  yoyNet: number | null;
  yoyOrders: number | null;
};

export type GuardrailStatus = {
  key: "net_margin" | "cash" | "paid_only";
  label: string;
  status: "pass" | "fail" | "unknown";
  value: number | null;
  threshold: number;
  unit: "pct" | "usd" | "none";
  source: "override" | "quickbooks" | "computed" | "rule" | null;
  asOf: string | null;
  detail: string;
};

export type DailyPoint = {
  day: string;
  net: number;
  orders: number;
  /** Same weekday last year (day - 364). */
  lyDay: string;
  netLy: number;
  ordersLy: number;
  cumulativeNet: number;
  cumulativeNetLy: number;
};

export type BfcmDay = DailyPoint & {
  weekday: number;
  isBfCm: boolean;
  isEarlyAccess: boolean;
  isFuture: boolean;
};

export type SyncStatus = {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  ok: boolean | null;
  complete: boolean | null;
  message: string | null;
  inProgress: boolean;
  /** Newest synced_at across orders — what the numbers actually reflect. */
  dataAsOf: string | null;
  baselineComplete: boolean;
  currentComplete: boolean;
};

export type TargetsData = {
  settings: TargetsSettings;
  today: string;
  window: { start: string; end: string };
  sync: SyncStatus;
  hasOrders: boolean;
  hasBaseline: boolean;
  baseline: {
    shopifyNet2025: number;
    shopifyOrders2025: number;
    nonShopify2025: number;
    total2025: number;
  };
  revenue: {
    dtc: Compared;
    dtcOther: Compared;
    b2b: Compared;
    marketplaces: Array<{ bucket: RevenueBucket; label: string } & Compared>;
    marketplacesTotal: Compared;
    wholesaleInvoiced: number;
    wholesaleBooked: number;
    /** DTC + other storefronts + marketplaces (+ B2B when counted) + wholesale invoiced. */
    total: number;
    totalLastYearToDate: number;
    seeding: { orders: number; units: number; retailValue: number; ly: { orders: number; units: number; retailValue: number } };
    excludedChannels: { orders: number; gross: number; net: number };
    unpaid: { orders: number; total: number };
    otherChannels: Array<{ channel: string; orders: number; net: number }>;
  };
  pace: PaceResult;
  tiers: TierProgress[];
  guardrails: GuardrailStatus[];
  daily: DailyPoint[];
  wholesale: WholesaleSummary;
  profit: ProfitabilityData;
  launches: LaunchesData;
  bfcm: {
    days: BfcmDay[];
    bfcm: { orders: number; net: number; ordersLy: number; netLy: number; daysElapsed: number; daysTotal: number };
    busiestDay: { day: string; orders: number } | null;
    busiestDayLy: { day: string; orders: number } | null;
    earlyAccess: { day: string; orders: number; net: number; lyDay: string; ordersLy: number; netLy: number };
    sla: {
      deadline: string;
      shipped: number;
      total: number;
      pct: number | null;
      ly: { shipped: number; total: number; pct: number | null };
    };
  };
};

type DailyRow = {
  day_local: string;
  bucket: string;
  orders: number;
  gross_sales: number;
  discounts: number;
  returns: number;
  net_sales: number;
  units: number;
};

function n(v: unknown): number {
  const x = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function finalize(t: Omit<SectionTotals, "aov" | "discountRate">): SectionTotals {
  return {
    ...t,
    aov: t.orders > 0 ? t.netSales / t.orders : null,
    discountRate: t.grossSales > 0 ? t.discounts / t.grossSales : null,
  };
}

function sumRows(rows: DailyRow[], pick: (r: DailyRow) => boolean): SectionTotals {
  const acc = { orders: 0, netSales: 0, grossSales: 0, discounts: 0, returns: 0, units: 0 };
  for (const r of rows) {
    if (!pick(r)) continue;
    acc.orders += n(r.orders);
    acc.netSales += n(r.net_sales);
    acc.grossSales += n(r.gross_sales);
    acc.discounts += n(r.discounts);
    acc.returns += n(r.returns);
    acc.units += n(r.units);
  }
  return finalize(acc);
}

function pct(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function compare(
  current: DailyRow[],
  lastYear: DailyRow[],
  lyToDateEnd: string,
  pick: (r: DailyRow) => boolean,
): Compared {
  const cur = sumRows(current, pick);
  const lyToDate = sumRows(lastYear, (r) => pick(r) && r.day_local <= lyToDateEnd);
  const lyFull = sumRows(lastYear, pick);
  return {
    current: cur,
    lastYear: lyToDate,
    lastYearFull: lyFull,
    yoyNet: pct(cur.netSales, lyToDate.netSales),
    yoyOrders: pct(cur.orders, lyToDate.orders),
  };
}

async function fetchDaily(db: DB, start: string, end: string): Promise<DailyRow[]> {
  type Raw = {
    day_local: string | null;
    bucket: string | null;
    orders: number | null;
    gross_sales: number | null;
    discounts: number | null;
    returns: number | null;
    net_sales: number | null;
    units: number | null;
  };
  const all: Raw[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("shopify_daily_sales")
      .select("day_local, bucket, orders, gross_sales, discounts, returns, net_sales, units")
      .gte("day_local", start)
      .lte("day_local", end)
      .order("day_local")
      .order("bucket")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`shopify_daily_sales: ${error.message}`);
    all.push(...((data ?? []) as Raw[]));
    if ((data ?? []).length < PAGE) break;
  }
  return all.map((r) => ({
    day_local: String(r.day_local),
    bucket: String(r.bucket),
    orders: n(r.orders),
    gross_sales: n(r.gross_sales),
    discounts: n(r.discounts),
    returns: n(r.returns),
    net_sales: n(r.net_sales),
    units: n(r.units),
  }));
}

async function fetchSettings(db: DB): Promise<TargetsSettings> {
  const { data } = await db
    .from("targets_settings")
    .select("value")
    .eq("key", TARGETS_SETTINGS_KEY)
    .maybeSingle();
  return parseTargetsSettings(data?.value ?? null);
}

async function fetchSync(db: DB): Promise<SyncStatus> {
  const [{ data: run }, { data: newest }, { data: states }] = await Promise.all([
    db
      .from("targets_sync_runs")
      .select("started_at, finished_at, ok, complete, message")
      .eq("job", "shopify_orders")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("shopify_orders")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("targets_sync_state").select("key, value"),
  ]);
  const inProgress = Boolean(
    run && !run.finished_at && Date.now() - Date.parse(run.started_at) < 15 * 60 * 1000,
  );
  const stateFor = (key: string) =>
    (states ?? []).find((s) => s.key === `shopify_orders:${key}`)?.value as
      | { complete?: boolean }
      | undefined;
  return {
    lastStartedAt: run?.started_at ?? null,
    lastFinishedAt: run?.finished_at ?? null,
    ok: run?.ok ?? null,
    complete: run?.complete ?? null,
    message: run?.message ?? null,
    inProgress,
    dataAsOf: newest?.synced_at ?? null,
    baselineComplete: Boolean(stateFor("q4_2025")?.complete),
    currentComplete: Boolean(stateFor("q4_2026")?.complete),
  };
}

type OrderSlaRow = { day_local: string; first_fulfilled_at: string | null; bucket: string };

// PostgREST caps a single response at 1,000 rows; page through anything that
// can exceed that (BF–CM alone is ~4,000 orders).
const PAGE = 1000;

async function fetchSlaOrders(db: DB, start: string, end: string): Promise<OrderSlaRow[]> {
  const out: OrderSlaRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("shopify_orders")
      .select("day_local, first_fulfilled_at, bucket")
      .gte("day_local", start)
      .lte("day_local", end)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`shopify_orders (sla): ${error.message}`);
    const rows = (data ?? []) as OrderSlaRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function fetchOtherChannels(
  db: DB,
  start: string,
  end: string,
): Promise<Array<{ channel: string; orders: number; net: number }>> {
  const rows: Array<{ app_name: string | null; source_name: string | null; net_sales: number }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("shopify_orders")
      .select("app_name, source_name, net_sales")
      .eq("bucket", "dtc_other")
      .gte("day_local", start)
      .lte("day_local", end)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`shopify_orders (other channels): ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const map = new Map<string, { orders: number; net: number }>();
  for (const r of rows) {
    const key = r.app_name || r.source_name || "unknown";
    const cur = map.get(key) ?? { orders: 0, net: 0 };
    cur.orders += 1;
    cur.net += n(r.net_sales);
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.net - a.net);
}

type QbRow = {
  as_of_date: string;
  cash_position: number | null;
  revenue: number | null;
  net_income: number | null;
  synced_at: string;
};

async function fetchQb(db: DB): Promise<{ cash: QbRow | null; pnl: QbRow | null }> {
  const [{ data: cash }, { data: pnl }] = await Promise.all([
    db
      .from("qb_financials")
      .select("as_of_date, cash_position, revenue, net_income, synced_at")
      .not("cash_position", "is", null)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("qb_financials")
      .select("as_of_date, cash_position, revenue, net_income, synced_at")
      .not("revenue", "is", null)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { cash: (cash as QbRow | null) ?? null, pnl: (pnl as QbRow | null) ?? null };
}

function guardrails(
  settings: TargetsSettings,
  qb: { cash: QbRow | null; pnl: QbRow | null },
  computed: { netMargin: number | null; weeksWithInputs: number; weeksWithSales: number },
): GuardrailStatus[] {
  const g = settings.guardrails;
  const o = settings.overrides;

  const computedPct = computed.netMargin == null ? null : computed.netMargin * 100;
  const marginValue = o.net_margin_pct ?? computedPct;
  const marginSource: GuardrailStatus["source"] =
    o.net_margin_pct != null ? "override" : computedPct != null ? "computed" : null;
  const margin: GuardrailStatus = {
    key: "net_margin",
    label: "Net margin",
    threshold: g.net_margin_min_pct,
    unit: "pct",
    value: marginValue,
    source: marginSource,
    asOf: null,
    status: marginValue == null ? "unknown" : marginValue >= g.net_margin_min_pct ? "pass" : "fail",
    detail:
      marginSource === "override"
        ? `Manual override. QuickBooks P&L ${qb.pnl ? `last synced ${qb.pnl.as_of_date}` : "has no Q4 data"}.`
        : marginSource === "computed"
          ? `Computed from the profitability panel: ${computed.weeksWithInputs} of ${computed.weeksWithSales} weeks have ad spend, 3PL and opex entered. Override in Settings if the books say otherwise.`
          : qb.pnl
            ? `QuickBooks P&L last synced ${qb.pnl.as_of_date} (single day, not Q4). Enter weekly costs in the profitability panel or a Q4 figure in Settings.`
            : "No QuickBooks P&L available. Enter weekly costs in the profitability panel or a Q4 net margin in Settings.",
  };

  const cashValue = o.cash_balance ?? qb.cash?.cash_position ?? null;
  const cash: GuardrailStatus = {
    key: "cash",
    label: "Cash reserve",
    threshold: g.cash_reserve_min,
    unit: "usd",
    value: cashValue,
    source: o.cash_balance != null ? "override" : qb.cash ? "quickbooks" : null,
    asOf: o.cash_balance != null ? null : qb.cash?.as_of_date ?? null,
    status: cashValue == null ? "unknown" : cashValue >= g.cash_reserve_min ? "pass" : "fail",
    detail:
      o.cash_balance != null
        ? `Manual override${qb.cash ? `; QuickBooks showed ${Math.round(qb.cash.cash_position ?? 0).toLocaleString("en-US")} on ${qb.cash.as_of_date}` : ""}.`
        : qb.cash
          ? `QuickBooks bank balance as of ${qb.cash.as_of_date}. The QuickBooks feed stopped on that date; override when you have a current figure.`
          : "No QuickBooks balance available. Enter a cash figure to evaluate.",
  };

  const paidOnly: GuardrailStatus = {
    key: "paid_only",
    label: "Paid orders only",
    threshold: 0,
    unit: "none",
    value: null,
    source: "rule",
    asOf: null,
    status: "pass",
    detail:
      "Revenue counts paid Shopify orders only. Seeding, gifting, 100%-discounted and excluded-channel orders are tracked separately as marketing.",
  };

  return [margin, cash, paidOnly];
}

const REVENUE_PICK = (settings: TargetsSettings) => (r: DailyRow): boolean => {
  const b = r.bucket as Bucket;
  if (b === "dtc" || b === "dtc_other") return true;
  if (MARKETPLACE_BUCKETS.includes(b as RevenueBucket)) return true;
  if (b === "b2b") return settings.count_b2b_in_total;
  return false;
};

function dailySeries(
  rows: DailyRow[],
  pick: (r: DailyRow) => boolean,
  days: string[],
): Map<string, { net: number; orders: number }> {
  const map = new Map<string, { net: number; orders: number }>();
  for (const d of days) map.set(d, { net: 0, orders: 0 });
  for (const r of rows) {
    if (!pick(r)) continue;
    const cur = map.get(r.day_local);
    if (!cur) continue;
    cur.net += r.net_sales;
    cur.orders += r.orders;
  }
  return map;
}

export async function getTargetsData(db: DB): Promise<TargetsData> {
  const settings = await fetchSettings(db);
  const year = settings.year;
  const start = `${year}-10-01`;
  const end = `${year}-12-31`;
  const lyStart = `${year - 1}-10-01`;
  const lyEnd = `${year - 1}-12-31`;
  const today = todayLocal();
  // Days in the quarter are compared on day-of-quarter; BFCM days on weekday.
  const clampedToday = today < start ? addDays(start, -1) : today > end ? end : today;
  const dayIndex = Math.max(0, Math.round((Date.parse(`${clampedToday}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000));
  const lyToDateEnd = addDays(lyStart, dayIndex);

  const [current, lastYear, sync, qb, otherChannels] = await Promise.all([
    fetchDaily(db, start, end),
    fetchDaily(db, lyStart, lyEnd),
    fetchSync(db),
    fetchQb(db),
    fetchOtherChannels(db, start, end),
  ]);

  const pickRevenue = REVENUE_PICK(settings);
  const cmp = (pick: (r: DailyRow) => boolean) => compare(current, lastYear, lyToDateEnd, pick);

  const dtc = cmp((r) => r.bucket === "dtc");
  const dtcOther = cmp((r) => r.bucket === "dtc_other");
  const b2b = cmp((r) => r.bucket === "b2b");
  const marketplaces = MARKETPLACE_BUCKETS.map((bucket) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    ...cmp((r) => r.bucket === bucket),
  }));
  const marketplacesTotal = cmp((r) => MARKETPLACE_BUCKETS.includes(r.bucket as RevenueBucket));

  const seedingCur = sumRows(current, (r) => r.bucket === "excluded_seeding");
  const seedingLy = sumRows(lastYear, (r) => r.bucket === "excluded_seeding" && r.day_local <= lyToDateEnd);
  const excludedCur = sumRows(current, (r) => r.bucket === "excluded_channel");
  const unpaidCur = sumRows(current, (r) => r.bucket === "excluded_unpaid");

  const revenueBuckets = [...REVENUE_BUCKETS].filter(
    (b) => b !== "b2b" || settings.count_b2b_in_total,
  );
  const [wholesale, profit, launches] = await Promise.all([
    getWholesaleSummary(db, { start, end }),
    getProfitability(db, {
      daily: current,
      window: { start, end },
      today,
      revenueBuckets,
      thresholds: {
        discountRateMaxPct: settings.flags.discount_rate_max_pct,
        netMarginMinPct: settings.guardrails.net_margin_min_pct,
      },
    }),
    getLaunches(db, { today, windowEnd: end, revenueBuckets }),
  ]);
  const wholesaleInvoiced = wholesale.invoicedQ4;
  const wholesaleBooked = wholesale.bookedNotInvoiced;

  const shopifyTotal = sumRows(current, pickRevenue).netSales;
  const total = shopifyTotal + wholesaleInvoiced;
  const totalLastYearToDate = sumRows(lastYear, (r) => pickRevenue(r) && r.day_local <= lyToDateEnd).netSales;

  // Baseline (last year's full quarter), Shopify + manual non-Shopify piece.
  const shopifyLyFull = sumRows(lastYear, pickRevenue);
  const nonShopify2025 = settings.overrides.non_shopify_baseline_2025 ?? 0;

  // Pace: current revenue by day vs last year's curve (same exclusions).
  const days = eachDay(start, end);
  const lyDays = eachDay(lyStart, lyEnd);
  const curByDay = dailySeries(current, pickRevenue, days);
  const lyByDay = dailySeries(lastYear, pickRevenue, lyDays);
  const pace = computePace({
    start,
    end,
    today,
    current: days.map((d) => ({ day: d, value: curByDay.get(d)?.net ?? 0 })),
    baseline: lastYear.length > 0 ? lyDays.map((d) => ({ day: d, value: lyByDay.get(d)?.net ?? 0 })) : null,
    baselineStart: lyStart,
  });
  // Wholesale invoiced is already in the quarter total; fold it into the
  // projection as a flat add (it is not part of the Shopify curve).
  const paceWithWholesale: PaceResult = {
    ...pace,
    toDate: pace.toDate + wholesaleInvoiced,
    linearProjection: pace.linearProjection + wholesaleInvoiced,
    curveProjection: pace.curveProjection == null ? null : pace.curveProjection + wholesaleInvoiced,
  };
  const tiers = tierProgress(settings.tiers, paceWithWholesale);

  // Daily points with same-weekday-last-year comparators and cumulatives.
  let cum = 0;
  let cumLy = 0;
  const daily: DailyPoint[] = days.map((d) => {
    const c = curByDay.get(d) ?? { net: 0, orders: 0 };
    const lyDay = sameWeekdayLastYear(d);
    const l = lyByDay.get(lyDay) ?? { net: 0, orders: 0 };
    if (d <= clampedToday) cum += c.net;
    cumLy += l.net;
    return {
      day: d,
      net: c.net,
      orders: c.orders,
      lyDay,
      netLy: l.net,
      ordersLy: l.orders,
      cumulativeNet: d <= clampedToday ? cum : cum,
      cumulativeNetLy: cumLy,
    };
  });

  // BFCM module.
  const bf = settings.bfcm;
  const bfcmDays: BfcmDay[] = daily
    .filter((p) => p.day >= bf.start && p.day <= bf.end)
    .map((p) => ({
      ...p,
      weekday: weekday(p.day),
      isBfCm: p.day >= bf.bf_cm_start && p.day <= bf.bf_cm_end,
      isEarlyAccess: p.day === bf.early_access,
      isFuture: p.day > today,
    }));
  const bfCmPoints = bfcmDays.filter((p) => p.isBfCm);
  const bfcmTotals = {
    orders: bfCmPoints.filter((p) => !p.isFuture).reduce((s, p) => s + p.orders, 0),
    net: bfCmPoints.filter((p) => !p.isFuture).reduce((s, p) => s + p.net, 0),
    ordersLy: bfCmPoints.reduce((s, p) => s + p.ordersLy, 0),
    netLy: bfCmPoints.reduce((s, p) => s + p.netLy, 0),
    daysElapsed: bfCmPoints.filter((p) => !p.isFuture).length,
    daysTotal: bfCmPoints.length,
  };
  const busiest = bfcmDays.filter((p) => !p.isFuture).reduce<{ day: string; orders: number } | null>(
    (best, p) => (p.orders > (best?.orders ?? -1) ? { day: p.day, orders: p.orders } : best),
    null,
  );
  const busiestLy = bfcmDays.reduce<{ day: string; orders: number } | null>(
    (best, p) => (p.ordersLy > (best?.orders ?? -1) ? { day: p.lyDay, orders: p.ordersLy } : best),
    null,
  );
  const ea = daily.find((p) => p.day === bf.early_access);
  const earlyAccess = {
    day: bf.early_access,
    orders: ea?.orders ?? 0,
    net: ea?.net ?? 0,
    lyDay: ea?.lyDay ?? sameWeekdayLastYear(bf.early_access),
    ordersLy: ea?.ordersLy ?? 0,
    netLy: ea?.netLy ?? 0,
  };

  // Fulfillment SLA: share of BF–CM revenue orders fulfilled by the deadline
  // (end of the ship-by day, store time). Last year's equivalent uses the
  // same weekday-aligned window and the same +N-day deadline.
  const slaDeadline = startOfLocalDayUtc(addDays(bf.sla_ship_by, 1)).getTime();
  const lyBfStart = sameWeekdayLastYear(bf.bf_cm_start);
  const lyBfEnd = sameWeekdayLastYear(bf.bf_cm_end);
  const lyDeadline = startOfLocalDayUtc(addDays(sameWeekdayLastYear(bf.sla_ship_by), 1)).getTime();
  const [slaRows, slaRowsLy] = await Promise.all([
    today >= bf.bf_cm_start ? fetchSlaOrders(db, bf.bf_cm_start, bf.bf_cm_end) : Promise.resolve([] as OrderSlaRow[]),
    fetchSlaOrders(db, lyBfStart, lyBfEnd),
  ]);
  const slaOf = (rows: OrderSlaRow[], deadline: number) => {
    const rev = rows.filter((r) => pickRevenue({ ...EMPTY_ROW, bucket: r.bucket }));
    const shipped = rev.filter((r) => r.first_fulfilled_at && Date.parse(r.first_fulfilled_at) <= deadline).length;
    return { shipped, total: rev.length, pct: rev.length > 0 ? shipped / rev.length : null };
  };
  const sla = { deadline: bf.sla_ship_by, ...slaOf(slaRows, slaDeadline), ly: slaOf(slaRowsLy, lyDeadline) };

  return {
    settings,
    today,
    window: { start, end },
    sync,
    hasOrders: current.length > 0,
    hasBaseline: lastYear.length > 0,
    baseline: {
      shopifyNet2025: shopifyLyFull.netSales,
      shopifyOrders2025: shopifyLyFull.orders,
      nonShopify2025,
      total2025: shopifyLyFull.netSales + nonShopify2025,
    },
    revenue: {
      dtc,
      dtcOther,
      b2b,
      marketplaces,
      marketplacesTotal,
      wholesaleInvoiced,
      wholesaleBooked,
      total,
      totalLastYearToDate,
      seeding: {
        orders: seedingCur.orders,
        units: seedingCur.units,
        retailValue: seedingCur.grossSales,
        ly: { orders: seedingLy.orders, units: seedingLy.units, retailValue: seedingLy.grossSales },
      },
      excludedChannels: { orders: excludedCur.orders, gross: excludedCur.grossSales, net: excludedCur.netSales },
      unpaid: { orders: unpaidCur.orders, total: unpaidCur.netSales },
      otherChannels,
    },
    pace: paceWithWholesale,
    tiers,
    guardrails: guardrails(settings, qb, profit.quarter),
    daily,
    wholesale,
    profit,
    launches,
    bfcm: { days: bfcmDays, bfcm: bfcmTotals, busiestDay: busiest, busiestDayLy: busiestLy, earlyAccess, sla },
  };
}

const EMPTY_ROW: DailyRow = {
  day_local: "",
  bucket: "",
  orders: 0,
  gross_sales: 0,
  discounts: 0,
  returns: 0,
  net_sales: 0,
  units: 0,
};
