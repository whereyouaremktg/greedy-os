import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { STALE_AFTER } from "@/lib/dashboard/staleness";
import { formatRelativeTime } from "@/lib/format";

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
