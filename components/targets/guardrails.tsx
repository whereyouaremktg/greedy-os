"use client";

import { CircleCheck, CircleHelp, CircleX, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GuardrailStatus } from "@/lib/targets/queries";
import { ratioPct, usd } from "@/components/targets/format";

function valueLabel(g: GuardrailStatus): string {
  if (g.unit === "none") return "";
  if (g.value == null) return "no data";
  if (g.unit === "pct") return `${g.value.toFixed(1)}%`;
  return usd(g.value);
}

function thresholdLabel(g: GuardrailStatus): string {
  if (g.unit === "pct") return `≥ ${g.threshold}%`;
  if (g.unit === "usd") return `≥ ${usd(g.threshold)}`;
  return "";
}

export function GuardrailBadges({
  guardrails,
  onEdit,
}: {
  guardrails: GuardrailStatus[];
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] uppercase tracking-wider text-muted-foreground">Guardrails</span>
      {guardrails.map((g) => {
        const Icon = g.status === "pass" ? CircleCheck : g.status === "fail" ? CircleX : CircleHelp;
        return (
          <Tooltip key={g.key}>
            <TooltipTrigger className="outline-none">
              <Badge
                variant="outline"
                className={cn(
                  "h-7 gap-1.5 px-2.5 text-xs",
                  g.status === "pass" && "border-success/50 text-success",
                  g.status === "fail" && "border-danger/50 text-danger",
                  g.status === "unknown" && "border-warning/50 text-warning",
                )}
              >
                <Icon className="size-3.5" />
                <span className="text-foreground">{g.label}</span>
                {g.unit !== "none" ? (
                  <span className="num text-muted-foreground">
                    {valueLabel(g)} <span className="opacity-60">({thresholdLabel(g)})</span>
                  </span>
                ) : null}
                {g.source === "override" ? (
                  <span className="rounded-sm bg-muted px-1 text-[10px] uppercase text-muted-foreground">manual</span>
                ) : g.asOf ? (
                  <span className="text-[10px] text-muted-foreground">as of {g.asOf}</span>
                ) : null}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-[11px] leading-snug">
              {g.detail}
            </TooltipContent>
          </Tooltip>
        );
      })}
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={onEdit}>
        <Settings2 />
        Override
      </Button>
      <span className="sr-only">{ratioPct(0)}</span>
    </div>
  );
}
