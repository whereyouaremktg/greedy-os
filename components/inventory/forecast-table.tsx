import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/inventory/status-badge";
import type { SkuForecast } from "@/lib/inventory/forecast";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MonthsOfCover({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-muted-foreground">—</span>;
  const tone =
    value < 1
      ? "text-danger"
      : value < 2
        ? "text-warning"
        : "text-foreground";
  return <span className={tone}>{value.toFixed(1)}</span>;
}

function YoyGrowth({ value }: { value: number | null }) {
  if (value == null)
    return <span className="text-muted-foreground">—</span>;
  const pct = value * 100;
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        pct > 0 && "text-success",
        pct < 0 && "text-danger",
        pct === 0 && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {formatPercent(pct, 0)}
    </span>
  );
}

export function ForecastTable({ forecasts }: { forecasts: SkuForecast[] }) {
  if (forecasts.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No SKUs to forecast yet. Demand history and on-hand will appear here
        once synced.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">SKU / Product</th>
              <th className="px-3 py-2.5 text-right font-medium">On hand</th>
              <th className="px-3 py-2.5 text-right font-medium">Incoming</th>
              <th className="px-3 py-2.5 text-right font-medium">
                Cover (mo)
              </th>
              <th className="px-3 py-2.5 text-right font-medium">YoY</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Stockout</th>
              <th className="px-3 py-2.5 font-medium">Order by</th>
              <th className="px-4 py-2.5 text-right font-medium">Reorder</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((f) => (
              <tr
                key={f.sku}
                className="border-b border-border/40 last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium leading-tight">
                    {f.productTitle}
                  </div>
                  <div className="text-[11px] text-muted-foreground num">
                    {f.sku}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right num">
                  {formatCount(f.onHand)}
                </td>
                <td className="px-3 py-2.5 text-right num text-muted-foreground">
                  {f.incomingUnits > 0 ? formatCount(f.incomingUnits) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right num">
                  <MonthsOfCover value={f.monthsOfCover} />
                </td>
                <td className="px-3 py-2.5 text-right num">
                  <YoyGrowth value={f.yoyGrowth} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-3 py-2.5 num text-muted-foreground whitespace-nowrap">
                  {formatDate(f.stockoutDate)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 num whitespace-nowrap",
                    f.status === "order_now"
                      ? "text-danger font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {formatDate(f.orderByDate)}
                </td>
                <td className="px-4 py-2.5 text-right num font-medium">
                  {f.reorderQty > 0 ? formatCount(f.reorderQty) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
