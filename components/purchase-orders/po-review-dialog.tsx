"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsd } from "@/lib/format";
import { createPurchaseOrderFromParsed } from "@/lib/actions/purchase-orders";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";

type Props = {
  parsed: ParsedPurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PoReviewDialog({ parsed, open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleSave() {
    if (!parsed) return;

    startTransition(async () => {
      const result = await createPurchaseOrderFromParsed(parsed);
      if (result.ok && result.data) {
        toast.success(
          `Saved PO ${result.data.po_number ?? result.data.id.slice(0, 8)} — ${result.data.line_item_count} styles, ${result.data.total_units.toLocaleString()} units`,
        );
        onOpenChange(false);
        router.refresh();
      } else if (!result.ok) {
        toast.error(result.error);
      }
    });
  }

  if (!parsed) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review parsed purchase order</DialogTitle>
          <DialogDescription>
            Confirm extracted fields before saving. Cancel dates will appear on
            the timeline.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Buyer</dt>
            <dd className="font-medium">{parsed.buyer_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PO #</dt>
            <dd className="font-medium">
              {parsed.vendor_po_number ?? parsed.order_number ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Order date</dt>
            <dd className="font-medium">{parsed.order_date}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total units</dt>
            <dd className="font-medium num">
              {parsed.total_units.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-medium num">
              {formatUsd(parsed.total_price, 2)}
            </dd>
          </div>
          {parsed.season ? (
            <div>
              <dt className="text-muted-foreground">Season</dt>
              <dd className="font-medium">{parsed.season}</dd>
            </div>
          ) : null}
        </dl>

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
              {parsed.line_items.map((item, i) => (
                <TableRow key={`${item.style_number ?? item.product_name}-${i}`}>
                  <TableCell>
                    <div className="font-medium">{item.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[item.revolve_code, item.color].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right num">
                    {item.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right num">
                    {formatUsd(item.unit_price, 2)}
                  </TableCell>
                  <TableCell className="text-right num text-destructive">
                    {item.cancel_date}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save purchase order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
