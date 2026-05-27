import type { ReactNode } from "react";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { ChannelMixCard } from "@/components/dashboard/channel-mix-card";
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
  getRevenueByChannel,
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
    channels,
  ] = await Promise.all([
    getCashSnapshot(supabase),
    getArAging(supabase),
    getRevenueTrend(supabase),
    getEmailAffiliateRevenue(supabase),
    getWholesalePipeline(supabase),
    getPoPaymentsStatus(supabase),
    getInProductionCount(supabase),
    getRevenueByChannel(supabase),
  ]);

  const arBuckets = ar.buckets;
  const arBucketLabel = `${formatUsd(arBuckets.current)} curr · ${formatUsd(arBuckets.d30)} 30 · ${formatUsd(arBuckets.d60)} 60 · ${formatUsd(arBuckets.d90 + arBuckets.over90)} 90+`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            One question per tile. Metrics read from the cache, refreshed on
            schedule.
          </p>
        </header>

        <Section title="Revenue" subtitle="Channel mix, DTC trend, AOV">
          <ChannelMixCard
            points={channels.points.map((p) => ({
              date: p.date,
              dtc: p.dtc,
              wholesale: p.wholesale,
            }))}
            totalDtc={channels.totalDtc}
            totalWholesale={channels.totalWholesale}
            totalOther={channels.totalOther}
            dtcShare={channels.dtcShare}
            wholesaleShare={channels.wholesaleShare}
            dtcDelta={channels.dtcDelta}
            wholesaleDelta={channels.wholesaleDelta}
            syncedAt={channels.syncedAt}
            staleAfterMs={STALE_AFTER.qb}
            hasData={channels.hasData}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTile
              title="DTC revenue (Shopify, 30d)"
              rawValue={revenue.totalRevenue}
              format="usd"
              sub={`${formatCount(revenue.totalOrders)} orders`}
              hint="Shopify · pulled every 2h"
              syncedAt={revenue.syncedAt}
              staleAfterMs={STALE_AFTER.shopify}
              trend={revenue.revenueTrend}
              delta={revenue.revenueDelta}
            />
            <KpiTile
              title="Wholesale revenue (QB, 30d)"
              rawValue={channels.hasData ? channels.totalWholesale : null}
              format="usd"
              sub={
                channels.hasData
                  ? `${(channels.wholesaleShare * 100).toFixed(0)}% of channel mix`
                  : "Awaiting QuickBooks class sync"
              }
              hint="QuickBooks · classes mapped to wholesale"
              syncedAt={channels.syncedAt}
              staleAfterMs={STALE_AFTER.qb}
              trend={channels.wholesaleTrend}
              delta={channels.wholesaleDelta}
            />
            <KpiTile
              title="AOV"
              rawValue={revenue.aov}
              format="usd"
              fractionDigits={2}
              sub="30-day weighted"
              hint="Shopify"
              syncedAt={revenue.syncedAt}
              staleAfterMs={STALE_AFTER.shopify}
              trend={revenue.aovTrend}
              delta={revenue.aovDelta}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTile
              title="Email + affiliate revenue"
              rawValue={email.total}
              format="usd"
              sub={`${formatUsd(email.emailRevenue)} email · ${formatUsd(email.affiliateRevenue)} affiliate`}
              hint="Klaviyo · pulled every 4h"
              syncedAt={email.syncedAt}
              staleAfterMs={STALE_AFTER.klaviyo}
              trend={email.trend}
              delta={email.delta}
            />
            <KpiTile
              title="Wholesale pipeline"
              rawValue={pipeline.totalOpenAmount}
              format="usd"
              sub={`${formatCount(pipeline.openDealCount)} open deals`}
              hint="HubSpot · pulled every 6h"
              syncedAt={pipeline.syncedAt}
              staleAfterMs={STALE_AFTER.hubspot}
              trend={pipeline.trend}
              delta={pipeline.delta}
            />
          </div>
        </Section>

        <Section title="Cash & receivables" subtitle="Position today, AR aging">
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTile
              title="Cash position"
              rawValue={cash.cashPosition}
              format="usd"
              hint="QuickBooks · pulled every 6h"
              syncedAt={cash.syncedAt}
              staleAfterMs={STALE_AFTER.qb}
              trend={cash.trend}
              delta={cash.delta}
            />
            <KpiTile
              title="AR aging"
              rawValue={ar.arTotal}
              format="usd"
              sub={arBucketLabel}
              hint="0/30/60/90+ from QuickBooks"
              syncedAt={ar.syncedAt}
              staleAfterMs={STALE_AFTER.qb}
              trend={ar.trend}
              delta={ar.delta}
            />
          </div>
        </Section>

        <Section title="Operations" subtitle="POs and active manufacturing">
          <div className="grid gap-3 sm:grid-cols-2">
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
        </Section>

        <Section title="Trends" subtitle="DTC revenue and wholesale pipeline">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-muted-foreground">
                  DTC revenue — last 30 days
                </CardTitle>
              </CardHeader>
              <CardContent className="text-brand pt-0">
                <RevenueTrendChart data={revenue.points} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[13px] font-medium text-muted-foreground">
                  Wholesale pipeline by state
                </CardTitle>
              </CardHeader>
              <CardContent className="text-brand pt-0">
                <PipelineByStateChart data={pipeline.byState} />
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>

      <aside className="min-h-[480px] lg:min-h-0">
        <ChatPanel />
      </aside>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[11px] text-muted-foreground/70">
            {subtitle}
          </span>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
