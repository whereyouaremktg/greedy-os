"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import { formatStaleness } from "@/lib/dashboard/staleness";
import {
  statusDotClass,
  tileStatus,
  SyncTooltip,
} from "@/components/dashboard/kpi-tile";

export type CompoundValue = {
  label: string;
  value: number;
  tone?: "warning" | "neutral";
};

type Props = {
  title: string;
  hint?: string;
  primary: CompoundValue;
  secondary: CompoundValue;
  syncedAt?: string | null;
  staleAfterMs?: number | null;
};

export function CompoundKpiTile({
  title,
  hint,
  primary,
  secondary,
  syncedAt = null,
  staleAfterMs = null,
}: Props) {
  const computed = tileStatus(syncedAt, staleAfterMs);
  const syncLabel =
    computed === "pending" ? null : formatStaleness(syncedAt, staleAfterMs);
  const showDot = syncedAt != null;

  const primaryWarn =
    primary.tone === "warning" && primary.value > 0 ? "text-warning" : "";
  const secondaryWarn =
    secondary.tone === "warning" && secondary.value > 0 ? "text-warning" : "";

  return (
    <Card className="h-full relative overflow-hidden">
      {showDot ? (
        <div className="absolute top-3 right-3">
          {syncedAt ? (
            <SyncTooltip syncedAt={syncedAt}>
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
      </CardHeader>

      <CardContent className="pt-0">
        <div>
          <div
            className={cn(
              "text-2xl font-semibold tracking-tight num",
              primaryWarn,
            )}
          >
            {formatCount(primary.value)}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
            {primary.label}
          </div>
        </div>

        <div className="border-t border-border/40 my-2" />

        <div className={cn("text-base num text-muted-foreground", secondaryWarn)}>
          {formatCount(secondary.value)}{" "}
          <span className="text-muted-foreground">{secondary.label}</span>
        </div>

        {hint ? (
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            {hint}
          </p>
        ) : null}

        {syncLabel ? (
          <p
            className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2"
            suppressHydrationWarning
          >
            {syncLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
