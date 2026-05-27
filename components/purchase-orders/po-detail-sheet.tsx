"use client";

import { Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/format";

export type PoDetail = {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  vendor_name: string;
  line_items: Array<{
    id: string;
    product_name: string;
    sku: string | null;
    style_number: string | null;
    color: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number | null;
    retail_price: number | null;
    cancel_date: string | null;
  }>;
};

type Props = {
  detail: PoDetail | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PoDetailSheet({
  detail,
  loading,
  error,
  open,
  onOpenChange,
}: Props) {
  const totalUnits =
    detail?.line_items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {detail?.po_number ? `PO ${detail.po_number}` : "Purchase order"}
          </SheetTitle>
          <SheetDescription>
            {detail?.vendor_name ?? "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="mt-6 text-sm text-destructive">{error}</p>
        ) : detail ? (
          <div className="mt-6 space-y-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{detail.status.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Order date</dt>
                <dd>{formatDate(detail.order_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Latest cancel</dt>
                <dd className="text-destructive">
                  {formatDate(detail.expected_date)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="num font-medium">
                  {formatUsd(detail.total, 2)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Units</dt>
                <dd className="num">{totalUnits.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Styles</dt>
                <dd className="num">{detail.line_items.length}</dd>
              </div>
            </dl>

            {detail.notes ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {detail.notes}
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Cancel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.line_items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[item.sku, item.color].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right num">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right num">
                        {formatUsd(item.unit_cost, 2)}
                      </TableCell>
                      <TableCell className="text-right num text-destructive">
                        {formatDate(item.cancel_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
