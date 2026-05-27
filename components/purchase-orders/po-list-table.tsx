"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PoRow } from "@/components/purchase-orders/types";
import { formatUsd } from "@/lib/format";
import {
  formatPoStatusLabel,
  type PoStatus,
} from "@/lib/purchase-orders/statuses";
import { cn } from "@/lib/utils";

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PoListTable({
  orders,
  onOpenOrder,
}: {
  orders: PoRow[];
  onOpenOrder: (order: PoRow) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PO #</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Order date</TableHead>
            <TableHead>Latest cancel</TableHead>
            <TableHead>Shipment</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((po) => (
            <TableRow
              key={po.id}
              className="cursor-pointer"
              onClick={() => onOpenOrder(po)}
            >
              <TableCell className="font-medium">
                {po.po_number ?? "—"}
              </TableCell>
              <TableCell>{po.vendor_name}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[11px]",
                    po.status === "confirmed"
                      ? "bg-brand/10 text-brand"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {formatPoStatusLabel(po.status as PoStatus)}
                </span>
              </TableCell>
              <TableCell>{formatDate(po.order_date)}</TableCell>
              <TableCell className="text-destructive">
                {formatDate(po.expected_date)}
              </TableCell>
              <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                {po.tracking_number
                  ? [po.carrier, po.tracking_number].filter(Boolean).join(" · ")
                  : "—"}
              </TableCell>
              <TableCell className="text-right num">
                {po.total_units.toLocaleString()}
              </TableCell>
              <TableCell className="text-right num">
                {formatUsd(po.total, 2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
