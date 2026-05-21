import { KpiTile } from "@/components/dashboard/kpi-tile";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueTrendChart } from "@/components/dashboard/revenue-trend-chart";
import { PipelineByStateChart } from "@/components/dashboard/pipeline-by-state-chart";
import { createClient } from "@/lib/supabase/server";
import { STALE_AFTER } from "@/lib/dashboard/staleness";
import {
  formatCount,
  formatUsd,
  getArAging,
  getCashSnapshot,
  getEmailAffiliateRevenue,
  getInProductionCount,
  getPoPaymentsStatus,
  getRevenueTrend,
  getWholesalePipeline,
} from "@/lib/dashboard/metrics";

export default async function DashboardPage() {
  const supabase = await createClient();
  const [
    cash,
    ar,
    revenue,
    email,
    pipeline,
    poPayments,
    production,
  ] = await Promise.all([
    getCashSnapshot(supabase),
    getArAging(supabase),
    getRevenueTrend(supabase),
    getEmailAffiliateRevenue(supabase),
    getWholesalePipeline(supabase),
    getPoPaymentsStatus(supabase),
    getInProductionCount(supabase),
  ]);

  const arBuckets = ar.buckets;
  const arBucketLabel = `${formatUsd(arBuckets.current)} curr · ${formatUsd(arBuckets.d30)} 30 · ${formatUsd(arBuckets.d60)} 60 · ${formatUsd(arBuckets.d90 + arBuckets.over90)} 90+`;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            One question per tile. All metrics read from the cache, refreshed
            on a schedule.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiTile
            title="Cash position"
            value={formatUsd(cash.cashPosition)}
            hint="QuickBooks · pulled every 6h"
            syncedAt={cash.syncedAt}
            staleAfterMs={STALE_AFTER.qb}
          />
          <KpiTile
            title="AR aging"
            value={formatUsd(ar.arTotal)}
            sub={arBucketLabel}
            hint="0/30/60/90+ from QuickBooks"
            syncedAt={ar.syncedAt}
            staleAfterMs={STALE_AFTER.qb}
          />
          <KpiTile
            title="DTC revenue (30d)"
            value={formatUsd(revenue.totalRevenue)}
            sub={`${formatCount(revenue.totalOrders)} orders`}
            hint="Shopify · pulled every 2h"
            syncedAt={revenue.syncedAt}
            staleAfterMs={STALE_AFTER.shopify}
          />
          <KpiTile
            title="AOV"
            value={formatUsd(revenue.aov, 2)}
            sub="30-day weighted"
            hint="Shopify"
            syncedAt={revenue.syncedAt}
            staleAfterMs={STALE_AFTER.shopify}
          />
          <KpiTile
            title="Email + affiliate revenue"
            value={formatUsd(email.total)}
            sub={`${formatUsd(email.emailRevenue)} email · ${formatUsd(email.affiliateRevenue)} affiliate`}
            hint="Klaviyo · pulled every 4h"
            syncedAt={email.syncedAt}
            staleAfterMs={STALE_AFTER.klaviyo}
          />
          <KpiTile
            title="Wholesale pipeline"
            value={formatUsd(pipeline.totalOpenAmount)}
            sub={`${formatCount(pipeline.openDealCount)} open deals`}
            hint="HubSpot · pulled every 6h"
            syncedAt={pipeline.syncedAt}
            staleAfterMs={STALE_AFTER.hubspot}
          />
          <KpiTile
            title="POs due / overdue"
            value={`${formatCount(poPayments.dueNext14Count)} / ${formatCount(poPayments.overdueCount)}`}
            sub={`${formatUsd(poPayments.dueNext14Amount)} due 14d · ${formatUsd(poPayments.overdueAmount)} overdue`}
            hint="Owned · po_payments"
          />
          <KpiTile
            title="In production"
            value={formatCount(production.total)}
            sub={`${formatCount(production.ordered)} ordered · ${formatCount(production.inProduction)} in production`}
            hint="Owned · manufacturing_runs"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                DTC revenue — last 30 days
              </CardTitle>
            </CardHeader>
            <CardContent className="text-emerald-600">
              <RevenueTrendChart data={revenue.points} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Wholesale pipeline by state
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sky-600">
              <PipelineByStateChart data={pipeline.byState} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="lg:sticky lg:top-8 lg:self-start lg:h-[calc(100vh-4rem)]">
        <ChatPanel />
      </div>
    </div>
  );
}
