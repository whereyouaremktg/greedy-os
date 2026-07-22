"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PoStatusBadge } from "@/components/purchase-orders/po-status-badge";
import type { PoRow } from "@/components/purchase-orders/types";
import { formatUsd } from "@/lib/format";
import {
  formatDaysToBadge,
  getArrivalPillVariant,
} from "@/lib/manufacturing/dates";
import { cn } from "@/lib/utils";

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buyerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function BuyerCell({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-md border border-brand/20 bg-brand/10 text-[10px] font-semibold tracking-wide text-brand-foreground/70 dark:text-brand"
        aria-hidden
      >
        {buyerInitials(name)}
      </span>
      <span className="truncate">{name}</span>
    </div>
  );
}

function CancelDateCell({ order }: { order: PoRow }) {
  const done = order.status === "closed" || order.status === "received";
  if (!order.expected_date) {
    return <span className="text-muted-foreground/50">—</span>;
  }

  const variant = done
    ? "neutral"
    : getArrivalPillVariant(order.expected_date, "ordered");

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "num",
          variant === "overdue" && "font-medium text-destructive",
          variant === "soon" && "font-medium text-warning",
          variant === "neutral" && (done ? "text-muted-foreground" : ""),
        )}
      >
        {formatDate(order.expected_date)}
      </span>
      {!done && variant !== "neutral" ? (
        <span
          className={cn(
            "num rounded-full px-1.5 py-px text-[10px] font-medium",
            variant === "overdue" && "bg-destructive/10 text-destructive",
            variant === "soon" && "bg-warning/15 text-warning",
          )}
        >
          {formatDaysToBadge(order.expected_date)}
        </span>
      ) : null}
    </div>
  );
}

export function PoListTable({
  orders,
  onOpenOrder,
}: {
  orders: PoRow[];
  onOpenOrder: (order: PoRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              PO #
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Buyer
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Status
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Order date
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Latest cancel
            </TableHead>
            <TableHead className="h-9 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Shipment
            </TableHead>
            <TableHead className="h-9 text-right text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Units
            </TableHead>
            <TableHead className="h-9 text-right text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Total
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((po) => (
            <TableRow
              key={po.id}
              className="cursor-pointer border-border/50 transition-colors hover:bg-muted/40"
              onClick={() => onOpenOrder(po)}
            >
              <TableCell className="font-medium">
                {po.po_number ?? (
                  <span className="font-normal text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell>
                <BuyerCell name={po.vendor_name} />
              </TableCell>
              <TableCell>
                <PoStatusBadge status={po.status} />
              </TableCell>
              <TableCell className="num text-muted-foreground">
                {formatDate(po.order_date)}
              </TableCell>
              <TableCell>
                <CancelDateCell order={po} />
              </TableCell>
              <TableCell className="max-w-[150px] truncate font-mono text-[11px] text-muted-foreground">
                {po.tracking_number ? (
                  [po.carrier, po.tracking_number].filter(Boolean).join(" · ")
                ) : (
                  <span className="font-sans text-muted-foreground/50">—</span>
                )}
              </TableCell>
              <TableCell className="num text-right text-muted-foreground">
                {po.total_units.toLocaleString()}
              </TableCell>
              <TableCell className="num text-right font-medium">
                {po.total > 0 ? (
                  formatUsd(po.total, 2)
                ) : (
                  <span className="font-normal text-muted-foreground/50">
                    {formatUsd(0, 2)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
