import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import type { SkuForecast } from "@/lib/inventory/forecast";

// "Order this week" banner: the urgent slice of the forecast at a glance.
// order_now = must place a PO now; order_soon = on deck within the lead window.
export function OrderSummaryBanner({ forecasts }: { forecasts: SkuForecast[] }) {
  const orderNow = forecasts.filter((f) => f.status === "order_now");
  const orderSoon = forecasts.filter((f) => f.status === "order_soon");
  const orderNowUnits = orderNow.reduce((sum, f) => sum + f.reorderQty, 0);

  const allClear = orderNow.length === 0 && orderSoon.length === 0;

  const Icon = orderNow.length
    ? AlertTriangle
    : orderSoon.length
      ? Clock
      : CheckCircle2;

  return (
    <Card
      className={cn(
        "border-l-2",
        orderNow.length
          ? "border-l-danger"
          : orderSoon.length
            ? "border-l-warning"
            : "border-l-success",
      )}
    >
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
        <div className="flex items-center gap-2.5">
          <Icon
            className={cn(
              "size-5 shrink-0",
              orderNow.length
                ? "text-danger"
                : orderSoon.length
                  ? "text-warning"
                  : "text-success",
            )}
          />
          <div>
            <div className="text-sm font-semibold tracking-tight">
              {allClear
                ? "Nothing to order this week"
                : "Order this week"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {allClear
                ? "No SKUs in the order-now or order-soon window."
                : "SKUs entering their reorder window."}
            </div>
          </div>
        </div>

        {!allClear ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 num">
            <Stat
              label="Order now"
              value={formatCount(orderNow.length)}
              tone="danger"
            />
            <Stat
              label="Units to reorder"
              value={formatCount(orderNowUnits)}
              tone="danger"
            />
            <Stat
              label="Order soon"
              value={formatCount(orderSoon.length)}
              tone="warning"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "danger" | "warning";
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          "text-lg font-semibold leading-none",
          tone === "danger" ? "text-danger" : "text-warning",
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
        {label}
      </span>
    </div>
  );
}
