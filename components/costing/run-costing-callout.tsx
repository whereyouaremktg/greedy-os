import type { ManufacturingRunRow } from "@/components/manufacturing/types";
import { formatUsd, formatPercent } from "@/lib/format";
import { runHasCosting } from "@/lib/costing/landed-margin";
import { cn } from "@/lib/utils";
import { Plane, Ship } from "lucide-react";

type ScenarioProps = {
  mode: "air" | "sea";
  freightUsd: number;
  landedPerUnitUsd: number | null;
  marginPerUnitUsd: number | null;
  marginPercent: number | null;
  compact?: boolean;
};

function CostingScenario({
  mode,
  freightUsd,
  landedPerUnitUsd,
  marginPerUnitUsd,
  marginPercent,
  compact = false,
}: ScenarioProps) {
  const Icon = mode === "air" ? Plane : Ship;
  const label = mode === "air" ? "Air" : "Sea";

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border bg-background/80 px-2.5 py-2",
        compact && "flex-1",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </div>
      <dl className="space-y-1 text-[10px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Freight</dt>
          <dd className="num font-medium tabular-nums">
            {formatUsd(freightUsd, 0)}
          </dd>
        </div>
        {landedPerUnitUsd != null ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Landed / unit</dt>
            <dd className="num font-semibold tabular-nums">
              {formatUsd(landedPerUnitUsd, 2)}
            </dd>
          </div>
        ) : null}
        {marginPerUnitUsd != null ? (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Margin / unit</dt>
            <dd
              className={cn(
                "num font-semibold tabular-nums",
                marginPerUnitUsd >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {formatUsd(marginPerUnitUsd, 2)}
              {marginPercent != null ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({formatPercent(marginPercent, 0)})
                </span>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function RunCostingCallout({ run }: { run: ManufacturingRunRow }) {
  if (!runHasCosting(run)) return null;

  const hasAir = run.air_freight_usd != null;
  const hasSea = run.sea_freight_usd != null;

  return (
    <div className="mt-2.5 space-y-1.5 rounded-md border border-border/70 bg-muted/20 p-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Landed cost &amp; margin
      </p>
      <div className={cn("flex gap-2", hasAir && hasSea ? "flex-col sm:flex-row" : "")}>
        {hasAir ? (
          <CostingScenario
            mode="air"
            freightUsd={run.air_freight_usd!}
            landedPerUnitUsd={run.air_landed_per_unit_usd}
            marginPerUnitUsd={run.air_margin_per_unit_usd}
            marginPercent={run.air_margin_percent}
            compact
          />
        ) : null}
        {hasSea ? (
          <CostingScenario
            mode="sea"
            freightUsd={run.sea_freight_usd!}
            landedPerUnitUsd={run.sea_landed_per_unit_usd}
            marginPerUnitUsd={run.sea_margin_per_unit_usd}
            marginPercent={run.sea_margin_percent}
            compact
          />
        ) : null}
      </div>
    </div>
  );
}
