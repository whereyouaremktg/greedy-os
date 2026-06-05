import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

export {
  formatUsd,
  formatCount,
  formatPercent,
  formatDelta,
} from "@/lib/format";

type DB = SupabaseClient<Database>;

const OPEN_DEAL_STAGES_EXCLUDED = ["closed_won", "closed_lost"] as const;
const TREND_DAYS = 14;

export type MetricDelta = {
  value: number;
  label?: string;
};

function lastN(values: number[], n = TREND_DAYS): number[] {
  if (values.length <= n) return values;
  return values.slice(-n);
}

function deltaFromSeries(series: number[], label = "vs prior 7d"): MetricDelta | undefined {
  if (series.length < 4) return undefined;
  const half = Math.floor(series.length / 2);
  const recent = series.slice(half).reduce((a, b) => a + b, 0);
  const prior = series.slice(0, half).reduce((a, b) => a + b, 0);
  if (prior === 0) return undefined;
  return { value: ((recent - prior) / Math.abs(prior)) * 100, label };
}

function deltaFromEndpoints(series: number[], label = "vs 14d ago"): MetricDelta | undefined {
  if (series.length < 2) return undefined;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0) return undefined;
  return { value: ((last - first) / Math.abs(first)) * 100, label };
}

function lastNDates(n: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setUTCDate(day.getUTCDate() - i);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

export type CashSnapshot = {
  cashPosition: number | null;
  syncedAt: string | null;
  trend?: number[];
  delta?: MetricDelta;
};

export async function getCashSnapshot(supabase: DB): Promise<CashSnapshot> {
  const { data: rows } = await supabase
    .from("qb_financials")
    .select("cash_position, synced_at, as_of_date")
    .order("as_of_date", { ascending: false })
    .limit(TREND_DAYS);

  const ordered = [...(rows ?? [])].reverse();
  const trend = lastN(ordered.map((r) => r.cash_position ?? 0));
  const latest = rows?.[0];

  return {
    cashPosition: latest?.cash_position ?? null,
    syncedAt: latest?.synced_at ?? null,
    trend: trend.length > 1 ? trend : undefined,
    delta: deltaFromEndpoints(trend),
  };
}

export type ArAging = {
  arTotal: number | null;
  buckets: { current: number; d30: number; d60: number; d90: number; over90: number };
  syncedAt: string | null;
  trend?: number[];
  delta?: MetricDelta;
};

export async function getArAging(supabase: DB): Promise<ArAging> {
  const { data: rows } = await supabase
    .from("qb_financials")
    .select(
      "ar_total, ar_aging_current, ar_aging_30, ar_aging_60, ar_aging_90, ar_aging_over_90, synced_at, as_of_date",
    )
    .order("as_of_date", { ascending: false })
    .limit(TREND_DAYS);

  const latest = rows?.[0];
  const ordered = [...(rows ?? [])].reverse();
  const trend = lastN(ordered.map((r) => r.ar_total ?? 0));

  return {
    arTotal: latest?.ar_total ?? null,
    buckets: {
      current: latest?.ar_aging_current ?? 0,
      d30: latest?.ar_aging_30 ?? 0,
      d60: latest?.ar_aging_60 ?? 0,
      d90: latest?.ar_aging_90 ?? 0,
      over90: latest?.ar_aging_over_90 ?? 0,
    },
    syncedAt: latest?.synced_at ?? null,
    trend: trend.length > 1 ? trend : undefined,
    delta: deltaFromEndpoints(trend),
  };
}

export type RevenueTrendPoint = {
  date: string;
  revenue: number;
  orderCount: number;
};

export type RevenueTrend = {
  points: RevenueTrendPoint[]; // oldest → newest
  totalRevenue: number; // grand total (DTC + Shopify wholesale)
  totalOrders: number;
  // DTC = Shopify orders not tagged B2B/Wholesale.
  dtcRevenue: number;
  dtcOrders: number;
  // Shopify B2B = orders tagged B2B/Wholesale.
  shopifyWholesaleRevenue: number;
  shopifyWholesaleOrders: number;
  aov: number | null;
  syncedAt: string | null;
  dtcTrend?: number[];
  dtcDelta?: MetricDelta;
  aovTrend?: number[];
  aovDelta?: MetricDelta;
};

export async function getRevenueTrend(supabase: DB): Promise<RevenueTrend> {
  const { data } = await supabase
    .from("shopify_metrics")
    .select(
      "as_of_date, revenue, order_count, dtc_revenue, wholesale_revenue, wholesale_order_count, synced_at",
    )
    .order("as_of_date", { ascending: false })
    .limit(30);

  const rows = data ?? [];
  const totalRevenue = rows.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.order_count ?? 0), 0);
  const shopifyWholesaleRevenue = rows.reduce(
    (sum, r) => sum + (r.wholesale_revenue ?? 0),
    0,
  );
  const shopifyWholesaleOrders = rows.reduce(
    (sum, r) => sum + (r.wholesale_order_count ?? 0),
    0,
  );

  // Rows synced before the channel-split migration have a null dtc_revenue;
  // fall back to treating the whole day's revenue as DTC.
  const dtcOf = (r: { revenue: number | null; dtc_revenue: number | null }) =>
    r.dtc_revenue ?? r.revenue ?? 0;

  const dtcRevenue = rows.reduce((sum, r) => sum + dtcOf(r), 0);
  const dtcOrders = totalOrders - shopifyWholesaleOrders;

  const points: RevenueTrendPoint[] = [...rows].reverse().map((r) => ({
    date: r.as_of_date,
    revenue: r.revenue ?? 0,
    orderCount: r.order_count ?? 0,
  }));

  const orderedRows = [...rows].reverse();
  const dtcTrend = lastN(orderedRows.map((r) => dtcOf(r)));
  const aovTrend = lastN(
    points.map((p) => (p.orderCount > 0 ? p.revenue / p.orderCount : 0)),
  );

  return {
    points,
    totalRevenue,
    totalOrders,
    dtcRevenue,
    dtcOrders,
    shopifyWholesaleRevenue,
    shopifyWholesaleOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : null,
    syncedAt: rows[0]?.synced_at ?? null,
    dtcTrend: dtcTrend.length > 1 ? dtcTrend : undefined,
    dtcDelta: deltaFromSeries(dtcTrend, "vs prior 7d"),
    aovTrend: aovTrend.length > 1 ? aovTrend : undefined,
    aovDelta: deltaFromSeries(aovTrend, "vs prior 7d"),
  };
}

export type PoWholesaleRevenue = {
  total: number;
  orderCount: number;
  trend?: number[];
  delta?: MetricDelta;
};

// Wholesale revenue from fulfilled customer POs (purchase_orders), counted on
// order_date over the trailing 30 days. Drafts and cancellations don't count.
const PO_REVENUE_EXCLUDED_STATUSES = ["draft", "cancelled"] as const;

export async function getPoWholesaleRevenue(
  supabase: DB,
): Promise<PoWholesaleRevenue> {
  const since = lastNDates(30)[0];
  const { data } = await supabase
    .from("purchase_orders")
    .select("total, order_date, status")
    .gte("order_date", since)
    .not("status", "in", `(${PO_REVENUE_EXCLUDED_STATUSES.join(",")})`);

  const rows = data ?? [];
  const total = rows.reduce((sum, r) => sum + (r.total ?? 0), 0);

  const dates = lastNDates(TREND_DAYS);
  const trend = dates.map((date) =>
    rows.reduce(
      (sum, r) => (r.order_date === date ? sum + (r.total ?? 0) : sum),
      0,
    ),
  );

  return {
    total,
    orderCount: rows.length,
    trend: trend.some((v) => v > 0) ? trend : undefined,
    delta: deltaFromSeries(trend, "vs prior 7d"),
  };
}

export type EmailAffiliate = {
  total: number;
  emailRevenue: number;
  affiliateRevenue: number;
  syncedAt: string | null;
  trend?: number[];
  delta?: MetricDelta;
};

export async function getEmailAffiliateRevenue(
  supabase: DB,
): Promise<EmailAffiliate> {
  const { data } = await supabase
    .from("klaviyo_metrics")
    .select("email_revenue, affiliate_revenue, synced_at")
    .order("as_of_date", { ascending: false })
    .limit(30);

  const rows = data ?? [];
  const emailRevenue = rows.reduce((s, r) => s + (r.email_revenue ?? 0), 0);
  const affiliateRevenue = rows.reduce(
    (s, r) => s + (r.affiliate_revenue ?? 0),
    0,
  );

  const ordered = [...rows].reverse();
  const daily = lastN(
    ordered.map((r) => (r.email_revenue ?? 0) + (r.affiliate_revenue ?? 0)),
  );

  return {
    total: emailRevenue + affiliateRevenue,
    emailRevenue,
    affiliateRevenue,
    syncedAt: rows[0]?.synced_at ?? null,
    trend: daily.length > 1 ? daily : undefined,
    delta: deltaFromSeries(daily, "vs prior 7d"),
  };
}

export type WholesalePipeline = {
  totalOpenAmount: number;
  openDealCount: number;
  byState: { state: string; amount: number; count: number }[];
  syncedAt: string | null;
  trend?: number[];
  delta?: MetricDelta;
};

export async function getWholesalePipeline(
  supabase: DB,
): Promise<WholesalePipeline> {
  const { data } = await supabase
    .from("hubspot_deals")
    .select("amount, stage, state, synced_at, close_date");

  const rows = data ?? [];
  const open = rows.filter(
    (r) => !OPEN_DEAL_STAGES_EXCLUDED.includes(r.stage as never),
  );

  const stateMap = new Map<string, { amount: number; count: number }>();
  let totalOpenAmount = 0;
  for (const deal of open) {
    const amount = deal.amount ?? 0;
    totalOpenAmount += amount;
    const key = deal.state ?? "Unknown";
    const prev = stateMap.get(key) ?? { amount: 0, count: 0 };
    stateMap.set(key, { amount: prev.amount + amount, count: prev.count + 1 });
  }

  const byState = [...stateMap.entries()]
    .map(([state, v]) => ({ state, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  const dates = lastNDates(TREND_DAYS);
  const trend = dates.map((date) =>
    open.reduce((sum, deal) => {
      const close = deal.close_date;
      if (!close || close >= date) return sum + (deal.amount ?? 0);
      return sum;
    }, 0),
  );

  return {
    totalOpenAmount,
    openDealCount: open.length,
    byState,
    syncedAt: rows[0]?.synced_at ?? null,
    trend: trend.some((v) => v > 0) ? trend : undefined,
    delta: deltaFromEndpoints(trend),
  };
}

export type PoPayments = {
  dueNext14Count: number;
  overdueCount: number;
  dueNext14Amount: number;
  overdueAmount: number;
};

export async function getPoPaymentsStatus(supabase: DB): Promise<PoPayments> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("po_payments")
    .select("amount, due_date, paid")
    .eq("paid", false)
    .not("due_date", "is", null);

  const rows = data ?? [];
  let dueNext14Count = 0;
  let overdueCount = 0;
  let dueNext14Amount = 0;
  let overdueAmount = 0;

  for (const p of rows) {
    if (!p.due_date) continue;
    if (p.due_date < todayIso) {
      overdueCount++;
      overdueAmount += p.amount ?? 0;
    } else if (p.due_date <= horizonIso) {
      dueNext14Count++;
      dueNext14Amount += p.amount ?? 0;
    }
  }

  return { dueNext14Count, overdueCount, dueNext14Amount, overdueAmount };
}

export type ChannelRevenuePoint = {
  date: string;
  dtc: number;
  wholesale: number;
  other: number;
  total: number;
};

export type RevenueByChannel = {
  points: ChannelRevenuePoint[]; // oldest → newest
  totalDtc: number;
  totalWholesale: number;
  totalOther: number;
  total: number;
  dtcShare: number; // 0..1, share of (dtc+wholesale) — ignores "other"
  wholesaleShare: number;
  dtcTrend?: number[];
  wholesaleTrend?: number[];
  dtcDelta?: MetricDelta;
  wholesaleDelta?: MetricDelta;
  syncedAt: string | null;
  hasData: boolean;
};

export async function getRevenueByChannel(
  supabase: DB,
): Promise<RevenueByChannel> {
  const { data } = await supabase
    .from("qb_revenue_by_channel")
    .select(
      "as_of_date, dtc_revenue, wholesale_revenue, other_revenue, total_revenue, synced_at",
    )
    .order("as_of_date", { ascending: false })
    .limit(30);

  const rows = data ?? [];
  const points: ChannelRevenuePoint[] = [...rows].reverse().map((r) => ({
    date: r.as_of_date,
    dtc: r.dtc_revenue ?? 0,
    wholesale: r.wholesale_revenue ?? 0,
    other: r.other_revenue ?? 0,
    total:
      r.total_revenue ??
      (r.dtc_revenue ?? 0) +
        (r.wholesale_revenue ?? 0) +
        (r.other_revenue ?? 0),
  }));

  const totalDtc = points.reduce((s, p) => s + p.dtc, 0);
  const totalWholesale = points.reduce((s, p) => s + p.wholesale, 0);
  const totalOther = points.reduce((s, p) => s + p.other, 0);
  const total = totalDtc + totalWholesale + totalOther;
  const known = totalDtc + totalWholesale;

  const dtcTrend = lastN(points.map((p) => p.dtc));
  const wholesaleTrend = lastN(points.map((p) => p.wholesale));

  return {
    points,
    totalDtc,
    totalWholesale,
    totalOther,
    total,
    dtcShare: known > 0 ? totalDtc / known : 0,
    wholesaleShare: known > 0 ? totalWholesale / known : 0,
    dtcTrend: dtcTrend.length > 1 ? dtcTrend : undefined,
    wholesaleTrend: wholesaleTrend.length > 1 ? wholesaleTrend : undefined,
    dtcDelta: deltaFromSeries(dtcTrend, "vs prior 7d"),
    wholesaleDelta: deltaFromSeries(wholesaleTrend, "vs prior 7d"),
    syncedAt: rows[0]?.synced_at ?? null,
    hasData: rows.length > 0 && total > 0,
  };
}

export type InProduction = {
  total: number;
  ordered: number;
  inProduction: number;
};

export async function getInProductionCount(
  supabase: DB,
): Promise<InProduction> {
  const { data } = await supabase
    .from("manufacturing_runs")
    .select("stage")
    .in("stage", ["ordered", "in_production"]);

  const rows = data ?? [];
  return {
    total: rows.length,
    ordered: rows.filter((r) => r.stage === "ordered").length,
    inProduction: rows.filter((r) => r.stage === "in_production").length,
  };
}

