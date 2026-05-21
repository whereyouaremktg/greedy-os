import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";

type DB = SupabaseClient<Database>;

const OPEN_DEAL_STAGES_EXCLUDED = ["closed_won", "closed_lost"] as const;

export type CashSnapshot = {
  cashPosition: number | null;
  syncedAt: string | null;
};

export async function getCashSnapshot(supabase: DB): Promise<CashSnapshot> {
  const { data } = await supabase
    .from("qb_financials")
    .select("cash_position, synced_at")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    cashPosition: data?.cash_position ?? null,
    syncedAt: data?.synced_at ?? null,
  };
}

export type ArAging = {
  arTotal: number | null;
  buckets: { current: number; d30: number; d60: number; d90: number; over90: number };
  syncedAt: string | null;
};

export async function getArAging(supabase: DB): Promise<ArAging> {
  const { data } = await supabase
    .from("qb_financials")
    .select(
      "ar_total, ar_aging_current, ar_aging_30, ar_aging_60, ar_aging_90, ar_aging_over_90, synced_at",
    )
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    arTotal: data?.ar_total ?? null,
    buckets: {
      current: data?.ar_aging_current ?? 0,
      d30: data?.ar_aging_30 ?? 0,
      d60: data?.ar_aging_60 ?? 0,
      d90: data?.ar_aging_90 ?? 0,
      over90: data?.ar_aging_over_90 ?? 0,
    },
    syncedAt: data?.synced_at ?? null,
  };
}

export type RevenueTrendPoint = {
  date: string;
  revenue: number;
  orderCount: number;
};

export type RevenueTrend = {
  points: RevenueTrendPoint[]; // oldest → newest
  totalRevenue: number;
  totalOrders: number;
  aov: number | null;
  syncedAt: string | null;
};

export async function getRevenueTrend(supabase: DB): Promise<RevenueTrend> {
  const { data } = await supabase
    .from("shopify_metrics")
    .select("as_of_date, revenue, order_count, synced_at")
    .order("as_of_date", { ascending: false })
    .limit(30);

  const rows = data ?? [];
  const totalRevenue = rows.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
  const totalOrders = rows.reduce((sum, r) => sum + (r.order_count ?? 0), 0);
  const points: RevenueTrendPoint[] = [...rows]
    .reverse()
    .map((r) => ({
      date: r.as_of_date,
      revenue: r.revenue ?? 0,
      orderCount: r.order_count ?? 0,
    }));

  return {
    points,
    totalRevenue,
    totalOrders,
    aov: totalOrders > 0 ? totalRevenue / totalOrders : null,
    syncedAt: rows[0]?.synced_at ?? null,
  };
}

export type EmailAffiliate = {
  total: number;
  emailRevenue: number;
  affiliateRevenue: number;
  syncedAt: string | null;
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

  return {
    total: emailRevenue + affiliateRevenue,
    emailRevenue,
    affiliateRevenue,
    syncedAt: rows[0]?.synced_at ?? null,
  };
}

export type WholesalePipeline = {
  totalOpenAmount: number;
  openDealCount: number;
  byState: { state: string; amount: number; count: number }[];
  syncedAt: string | null;
};

export async function getWholesalePipeline(
  supabase: DB,
): Promise<WholesalePipeline> {
  const { data } = await supabase
    .from("hubspot_deals")
    .select("amount, stage, state, synced_at");

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

  return {
    totalOpenAmount,
    openDealCount: open.length,
    byState,
    syncedAt: rows[0]?.synced_at ?? null,
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

export function formatUsd(n: number | null | undefined, fractionDigits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}
