import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { STALE_AFTER } from "@/lib/dashboard/staleness";
import { formatRelativeTime } from "@/lib/format";
import {
  getInProductionCount,
  getPoPaymentsStatus,
} from "@/lib/dashboard/metrics";
import { fetchTimelineEvents } from "@/lib/timeline/fetch";

type DB = SupabaseClient<Database>;

const CRON_MS = {
  qb: 6 * 60 * 60 * 1000,
  shopify: 2 * 60 * 60 * 1000,
  klaviyo: 4 * 60 * 60 * 1000,
  hubspot: 6 * 60 * 60 * 1000,
} as const;

export type GlobalSyncStatus = {
  latestSyncedAt: string | null;
  isStale: boolean;
  label: string;
};

export async function getGlobalSyncStatus(supabase: DB): Promise<GlobalSyncStatus> {
  const [qb, shopify, klaviyo, hubspot] = await Promise.all([
    supabase
      .from("qb_financials")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("shopify_metrics")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("klaviyo_metrics")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("hubspot_deals")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const entries = [
    { syncedAt: qb.data?.synced_at ?? null, threshold: STALE_AFTER.qb, cron: CRON_MS.qb },
    {
      syncedAt: shopify.data?.synced_at ?? null,
      threshold: STALE_AFTER.shopify,
      cron: CRON_MS.shopify,
    },
    {
      syncedAt: klaviyo.data?.synced_at ?? null,
      threshold: STALE_AFTER.klaviyo,
      cron: CRON_MS.klaviyo,
    },
    {
      syncedAt: hubspot.data?.synced_at ?? null,
      threshold: STALE_AFTER.hubspot,
      cron: CRON_MS.hubspot,
    },
  ];

  const timestamps = entries
    .map((e) => e.syncedAt)
    .filter((t): t is string => t != null)
    .map((t) => Date.parse(t))
    .filter((t) => !Number.isNaN(t));

  const latest =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  const isStale = entries.some((e) => {
    if (!e.syncedAt) return false;
    const synced = Date.parse(e.syncedAt);
    if (Number.isNaN(synced)) return true;
    return Date.now() - synced > e.cron * 2;
  });

  const label = latest
    ? isStale
      ? `Sync delayed — ${formatRelativeTime(Date.now() - Date.parse(latest))}`
      : `All systems synced ${formatRelativeTime(Date.now() - Date.parse(latest))}`
    : "Awaiting first sync";

  return { latestSyncedAt: latest, isStale, label };
}

export type NavCounter = { count: number; tone: "warning" | "neutral" } | null;
export type NavCounters = {
  purchaseOrders: NavCounter;
  manufacturing: NavCounter;
  timeline: NavCounter;
  campaigns: NavCounter;
};

function toNavCounter(
  count: number,
  tone: "warning" | "neutral",
): NavCounter {
  if (!Number.isFinite(count) || count <= 0) return null;
  return { count, tone };
}

export async function getNavCounters(supabase: DB): Promise<NavCounters> {
  const [poPayments, production, timeline, campaignTasks] = await Promise.all([
    getPoPaymentsStatus(supabase),
    getInProductionCount(supabase),
    fetchTimelineEvents(supabase),
    supabase
      .from("campaign_tasks")
      .select("status", { count: "exact", head: true })
      .not("status", "in", '("done")'),
  ]);

  const timelineOverdue = (timeline.events ?? []).filter(
    (e) => e.urgency === "overdue",
  ).length;

  return {
    purchaseOrders: toNavCounter(poPayments.overdueCount, "warning"),
    manufacturing: toNavCounter(production.total, "neutral"),
    timeline: toNavCounter(timelineOverdue, "warning"),
    campaigns: toNavCounter(campaignTasks.count ?? 0, "neutral"),
  };
}
