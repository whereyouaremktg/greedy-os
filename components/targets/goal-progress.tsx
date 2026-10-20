"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PaceResult, TierProgress } from "@/lib/targets/pace";
import { barPosition } from "@/lib/targets/pace";
import { count, signedPct, usd, usdCompact } from "@/components/targets/format";

type Props = {
  pace: PaceResult;
  tiers: TierProgress[];
  totalLastYearToDate: number;
  baselineTotal: number;
  today: string;
};

/**
 * The hero: one bar from $0 to just past the top tier. Filled = revenue to
 * date; two markers = where the quarter lands on the current pace (curve
 * weighted and linear); ticks = the three goal tiers.
 */
export function GoalProgress({ pace, tiers, totalLastYearToDate, baselineTotal, today }: Props) {
  const maxTier = Math.max(...tiers.map((t) => t.amount), 1);
  const scaleMax = maxTier * 1.08;
  const toDatePos = barPosition(pace.toDate, scaleMax);
  const curve = pace.curveProjection;
  const curvePos = curve != null ? barPosition(curve, scaleMax) : null;
  const linearPos = barPosition(pace.linearProjection, scaleMax);
  const yoy = totalLastYearToDate > 0 ? ((pace.toDate - totalLastYearToDate) / totalLastYearToDate) * 100 : null;
  const headline = curve ?? pace.linearProjection;
  const topReached = [...tiers].reverse().find((t) => headline >= t.amount);

  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted-foreground">Q4 revenue to date</div>
            <div className="mt-1 text-[40px] leading-none font-semibold tracking-tight md:text-[48px]">
              {usd(pace.toDate)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Day {count(pace.daysElapsed)} of {count(pace.daysTotal)} · {count(pace.daysRemaining)} left
              </span>
              {yoy != null ? (
                <span className={cn("num", yoy >= 0 ? "text-success" : "text-danger")}>
                  {signedPct(yoy)} vs same point last year
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm md:text-right">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pace (BFCM-weighted)</div>
              <div className="num text-lg font-semibold">{curve != null ? usd(curve) : "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {pace.baselineShareToDate != null
                  ? `LY had ${(pace.baselineShareToDate * 100).toFixed(0)}% of Q4 by now`
                  : "needs last year's curve"}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pace (linear)</div>
              <div className="num text-lg font-semibold">{usd(pace.linearProjection)}</div>
              <div className="text-[11px] text-muted-foreground">
                {topReached ? `clears ${topReached.label}` : "below Plan"}
              </div>
            </div>
          </div>
        </div>

        {/* The bar */}
        <div className="pt-6 pb-7">
          <div className="relative h-3 w-full rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-700"
              style={{ width: `${toDatePos * 100}%` }}
              aria-label={`Revenue to date ${usd(pace.toDate)}`}
            />
            {/* Projection markers */}
            {curvePos != null ? (
              <Marker pos={curvePos} label="Pace" value={usd(curve ?? 0)} tone="accent" above />
            ) : null}
            <Marker pos={linearPos} label="Linear" value={usd(pace.linearProjection)} tone="muted" above={curvePos == null} />
            {/* Tier ticks */}
            {tiers.map((t) => (
              <TierTick key={t.key} tier={t} pos={barPosition(t.amount, scaleMax)} />
            ))}
          </div>
        </div>

        {/* Tier chips */}
        <div className="grid gap-3 sm:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.key}
              className={cn(
                "rounded-lg border px-3 py-2.5",
                t.progress >= 1 ? "border-success/40 bg-success/5" : t.onPace ? "border-brand/40 bg-brand/5" : "border-border",
              )}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{t.label}</span>
                <span className="num text-[13px] text-muted-foreground">{usdCompact(t.amount)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between text-xs">
                <span className="num font-medium">{(t.progress * 100).toFixed(0)}% reached</span>
                <span
                  className={cn(
                    "font-medium",
                    t.progress >= 1 ? "text-success" : t.onPace ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {t.progress >= 1 ? "hit" : t.onPace ? "on pace" : "behind pace"}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground num">
                {t.gap > 0
                  ? `${usdCompact(t.gap)} to go${t.requiredPerDay != null ? ` · ${usdCompact(t.requiredPerDay)}/day needed` : ""}`
                  : "Target reached"}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Last year&apos;s Q4 total: {usd(baselineTotal)} (Shopify actual plus the manual non-Shopify
          figure). Pace uses last year&apos;s daily revenue curve with the same paid-only rules; through{" "}
          {today}.
        </p>
      </CardContent>
    </Card>
  );
}

function Marker({
  pos,
  label,
  value,
  tone,
  above,
}: {
  pos: number;
  label: string;
  value: string;
  tone: "accent" | "muted";
  above: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none"
        style={{ left: `${pos * 100}%` }}
        aria-label={`${label} projection ${value}`}
      >
        <span className="block h-7 w-7 -m-2 p-2">
          <span
            className={cn(
              "block size-3 rounded-full ring-2 ring-card",
              tone === "accent" ? "bg-brand" : "bg-muted-foreground",
            )}
          />
        </span>
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium",
            above ? "-top-5" : "top-6",
            tone === "accent" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[11px]">
        {label}: {value}
      </TooltipContent>
    </Tooltip>
  );
}

function TierTick({ tier, pos }: { tier: TierProgress; pos: number }) {
  return (
    <div
      className="absolute -top-1 bottom-[-4px] w-px bg-foreground/60"
      style={{ left: `${pos * 100}%` }}
      aria-hidden
    >
      <span className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground num">
        {tier.label} {usdCompact(tier.amount)}
      </span>
    </div>
  );
}
