import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ForecastStatus } from "@/lib/inventory/forecast";

const STATUS_META: Record<
  ForecastStatus,
  { label: string; className: string }
> = {
  order_now: {
    label: "Order now",
    className: "border-danger/40 bg-danger/10 text-danger",
  },
  order_soon: {
    label: "Order soon",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  watch: {
    label: "Watch",
    className: "border-border bg-muted text-foreground",
  },
  comfortable: {
    label: "Comfortable",
    className: "border-success/40 bg-success/10 text-success",
  },
  demand_down: {
    label: "Demand down",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
  insufficient_data: {
    label: "No data",
    className: "border-border bg-muted/60 text-muted-foreground",
  },
};

export function statusMeta(status: ForecastStatus) {
  return STATUS_META[status] ?? STATUS_META.insufficient_data;
}

export function StatusBadge({ status }: { status: ForecastStatus }) {
  const meta = statusMeta(status);
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] uppercase tracking-wide", meta.className)}
    >
      {meta.label}
    </Badge>
  );
}
