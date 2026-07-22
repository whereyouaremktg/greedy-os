import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { createClient } from "@/lib/supabase/server";
import { STALE_AFTER } from "@/lib/dashboard/staleness";
import {
  getArAging,
  getCashSnapshot,
  getEmailAffiliateRevenue,
  getInProductionCount,
  getPoPaymentsStatus,
  getPoWholesaleRevenue,
  getRevenueByChannel,
  getRevenueTrend,
  getWholesalePipeline,
} from "@/lib/dashboard/metrics";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    cash,
    ar,
    revenue,
    marketing,
    pipeline,
    poPayments,
    production,
    channels,
    poWholesale,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getCashSnapshot(supabase),
    getArAging(supabase),
    getRevenueTrend(supabase),
    getEmailAffiliateRevenue(supabase),
    getWholesalePipeline(supabase),
    getPoPaymentsStatus(supabase),
    getInProductionCount(supabase),
    getRevenueByChannel(supabase),
    getPoWholesaleRevenue(supabase),
  ]);

  return (
    <DashboardWorkspace
      email={user?.email ?? "unknown"}
      staleAfter={STALE_AFTER}
      cash={cash}
      ar={ar}
      revenue={revenue}
      marketing={marketing}
      pipeline={pipeline}
      poPayments={poPayments}
      production={production}
      channels={channels}
      poWholesale={poWholesale}
    />
  );
}
