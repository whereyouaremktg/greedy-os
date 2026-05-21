"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatUsd, formatCount, formatPercent } from "@/lib/format";
import {
  formatStaleness,
  tileStatus,
  type TileStatus,
} from "@/lib/dashboard/staleness";
import { AnimatedValue } from "@/components/dashboard/animated-value";
import { KpiSparkline } from "@/components/dashboard/kpi-sparkline";

export type KpiFormat = "usd" | "number" | "percent";

type Delta = {
  value: number;
  label?: string;
};

type Props = {
  title: string;
  /** Pre-formatted display for compound values (e.g. "3 / 2"). */
  value?: string;
  /** Raw numeric value for animated headline. */
  rawValue?: number | null;
  format?: KpiFormat;
  fractionDigits?: number;
  hint?: string;
  sub?: string;
  syncedAt?: string | null;
  staleAfterMs?: number | null;
  status?: TileStatus;
  trend?: number[];
  delta?: Delta;
};

function statusDotClass(status: TileStatus): string {
  switch (status) {
    case "live":
      return "bg-success";
    case "stale":
      return "bg-warning";
    case "pending":
      return "bg-muted-foreground/40";
    default:
      return "bg-muted-foreground/40";
  }
}

function DeltaRow({ delta }: { delta: Delta }) {
  const positive = delta.value > 0;
  const negative = delta.value < 0;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : Minus;

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs num mt-1",
        positive && "text-success",
        negative && "text-danger",
        !positive && !negative && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      <span>{formatPercent(delta.value)}</span>
      {delta.label ? (
        <span className="text-muted-foreground font-normal">{delta.label}</span>
      ) : null}
    </div>
  );
}

function HeadlineValue({
  value,
  rawValue,
  format = "number",
  fractionDigits = 0,
}: Pick<Props, "value" | "rawValue" | "format" | "fractionDigits">) {
  if (value != null) {
    return (
      <div className="text-2xl font-semibold tracking-tight num">{value}</div>
    );
  }

  if (rawValue == null) {
    return (
      <div className="text-2xl font-semibold tracking-tight num">—</div>
    );
  }

  return (
    <div className="text-2xl font-semibold tracking-tight">
      <AnimatedValue
        value={rawValue}
        format={format}
        fractionDigits={fractionDigits}
      />
    </div>
  );
}

function SyncTooltip({
  syncedAt,
  rawValue,
  format,
  fractionDigits,
  children,
}: {
  syncedAt: string;
  rawValue?: number | null;
  format?: KpiFormat;
  fractionDigits?: number;
  children: React.ReactNode;
}) {
  let precise = syncedAt;
  if (rawValue != null) {
    if (format === "usd") precise = `${formatUsd(rawValue, fractionDigits ?? 0)}\n${syncedAt}`;
    else if (format === "percent")
      precise = `${formatPercent(rawValue)}\n${syncedAt}`;
    else precise = `${formatCount(rawValue)}\n${syncedAt}`;
  }

  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex cursor-default">{children}</TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[11px] whitespace-pre">
        {precise}
      </TooltipContent>
    </Tooltip>
  );
}

export function KpiTile({
  title,
  value,
  rawValue,
  format = "number",
  fractionDigits = 0,
  hint,
  sub,
  syncedAt = null,
  staleAfterMs = null,
  status,
  trend,
  delta,
}: Props) {
  const computed: TileStatus = status ?? tileStatus(syncedAt, staleAfterMs);
  const syncLabel =
    computed === "pending" ? null : formatStaleness(syncedAt, staleAfterMs);
  const showBadge = status != null && syncedAt == null;
  const showDot = !showBadge;

  const headline = (
    <HeadlineValue
      value={value}
      rawValue={rawValue}
      format={format}
      fractionDigits={fractionDigits}
    />
  );

  return (
    <Card className="h-full relative overflow-hidden group">
      {showDot ? (
        <div className="absolute top-3 right-3">
          {syncedAt ? (
            <SyncTooltip
              syncedAt={syncedAt}
              rawValue={rawValue}
              format={format}
              fractionDigits={fractionDigits}
            >
              <span
                className={cn(
                  "block size-1.5 rounded-full",
                  statusDotClass(computed),
                  computed === "live" && "animate-pulse",
                )}
                aria-label={computed}
              />
            </SyncTooltip>
          ) : (
            <span
              className={cn(
                "block size-1.5 rounded-full",
                statusDotClass(computed),
              )}
              aria-label={computed}
            />
          )}
        </div>
      ) : null}

      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pr-6">
        <CardTitle className="text-[13px] font-medium text-muted-foreground leading-none">
          {title}
        </CardTitle>
        {showBadge ? (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] uppercase shrink-0",
              computed === "pending" && "text-muted-foreground",
              computed === "stale" && "border-warning text-warning",
              computed === "live" && "border-success text-success",
            )}
          >
            {computed}
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="pt-0">
        {syncedAt && rawValue != null ? (
          <SyncTooltip
            syncedAt={syncedAt}
            rawValue={rawValue}
            format={format}
            fractionDigits={fractionDigits}
          >
            {headline}
          </SyncTooltip>
        ) : (
          headline
        )}

        {delta ? <DeltaRow delta={delta} /> : null}

        {sub ? (
          <p className="text-xs text-foreground/70 mt-1 leading-snug">{sub}</p>
        ) : null}
        {hint ? (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            {hint}
          </p>
        ) : null}
        {syncLabel ? (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2">
            {syncLabel}
          </p>
        ) : null}

        {trend && trend.length > 1 ? <KpiSparkline data={trend} /> : null}
      </CardContent>
    </Card>
  );
}
