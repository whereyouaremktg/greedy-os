"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChannelRevenueChart } from "@/components/dashboard/channel-revenue-chart";
import { AnimatedValue } from "@/components/dashboard/animated-value";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatPercent, formatUsd } from "@/lib/format";
import {
  formatStaleness,
  tileStatus,
  type TileStatus,
} from "@/lib/dashboard/staleness";
import type { MetricDelta } from "@/lib/dashboard/metrics";

type Props = {
  points: { date: string; dtc: number; wholesale: number }[];
  totalDtc: number;
  totalWholesale: number;
  totalOther: number;
  dtcShare: number;
  wholesaleShare: number;
  dtcDelta?: MetricDelta;
  wholesaleDelta?: MetricDelta;
  syncedAt: string | null;
  staleAfterMs: number | null;
  hasData: boolean;
};

function statusDotClass(status: TileStatus): string {
  switch (status) {
    case "live":
      return "bg-success";
    case "stale":
      return "bg-warning";
    default:
      return "bg-muted-foreground/40";
  }
}

function DeltaInline({ delta }: { delta?: MetricDelta }) {
  if (!delta) return null;
  const positive = delta.value > 0;
  const negative = delta.value < 0;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 text-[11px]",
        positive && "text-success",
        negative && "text-danger",
        !positive && !negative && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {formatPercent(delta.value)}
    </span>
  );
}

export function ChannelMixCard({
  points,
  totalDtc,
  totalWholesale,
  totalOther,
  dtcShare,
  wholesaleShare,
  dtcDelta,
  wholesaleDelta,
  syncedAt,
  staleAfterMs,
  hasData,
}: Props) {
  const status = tileStatus(syncedAt, staleAfterMs);
  const syncLabel = formatStaleness(syncedAt, staleAfterMs);

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-3 right-3">
        <span
          className={cn(
            "block size-1.5 rounded-full",
            statusDotClass(status),
            status === "live" && "animate-pulse",
          )}
          aria-label={status}
        />
      </div>

      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3 pr-4">
          <div className="space-y-0.5">
            <h3 className="text-[13px] font-medium text-muted-foreground leading-none">
              Revenue by channel — last 30 days
            </h3>
            <p className="text-[11px] text-muted-foreground/80">
              QuickBooks · classes mapped to DTC vs wholesale
            </p>
          </div>
        </div>

        {hasData ? (
          <>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0 space-y-3">
                <ChannelMixBar
                  dtcShare={dtcShare}
                  wholesaleShare={wholesaleShare}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChannelStat
                    label="DTC"
                    swatchClass="bg-[var(--brand)]"
                    amount={totalDtc}
                    share={dtcShare}
                    delta={dtcDelta}
                  />
                  <ChannelStat
                    label="Wholesale"
                    swatchClass="bg-[var(--chart-3)]"
                    amount={totalWholesale}
                    share={wholesaleShare}
                    delta={wholesaleDelta}
                  />
                </div>
                {totalOther > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {formatUsd(totalOther)} unclassified — review QuickBooks
                    class names.
                  </p>
                ) : null}
              </div>
            </div>

            <ChannelRevenueChart data={points} />
          </>
        ) : (
          <EmptyState
            title="Channel split not synced yet"
            description="Enable Class Tracking in QuickBooks and name classes with DTC / Wholesale keywords. The next sync will populate this."
          />
        )}

        {syncLabel ? (
          <p
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
            suppressHydrationWarning
          >
            {syncLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChannelMixBar({
  dtcShare,
  wholesaleShare,
}: {
  dtcShare: number;
  wholesaleShare: number;
}) {
  const dtcPct = Math.round(dtcShare * 1000) / 10;
  const wholesalePct = Math.round(wholesaleShare * 1000) / 10;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>Channel mix</span>
        <span className="num text-foreground/80">
          {dtcPct.toFixed(1)}% · {wholesalePct.toFixed(1)}%
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-[var(--brand)] transition-all"
          style={{ width: `${dtcShare * 100}%` }}
          aria-label={`DTC ${dtcPct}%`}
        />
        <div
          className="h-full bg-[var(--chart-3)] transition-all"
          style={{ width: `${wholesaleShare * 100}%` }}
          aria-label={`Wholesale ${wholesalePct}%`}
        />
      </div>
    </div>
  );
}

function ChannelStat({
  label,
  swatchClass,
  amount,
  share,
  delta,
}: {
  label: string;
  swatchClass: string;
  amount: number;
  share: number;
  delta?: MetricDelta;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={cn("size-2 rounded-full", swatchClass)} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-xl font-semibold tracking-tight">
        <AnimatedValue value={amount} format="usd" />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="num">{(share * 100).toFixed(1)}% of mix</span>
        <DeltaInline delta={delta} />
      </div>
    </div>
  );
}
