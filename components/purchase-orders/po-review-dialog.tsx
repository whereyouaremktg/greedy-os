"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  ParsedLineItemsList,
  ReviewDialogShell,
  ReviewSummaryGrid,
  ReviewSummaryItem,
} from "@/components/documents/review-dialog-shell";
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
      <ReviewDialogShell
        title="Review parsed purchase order"
        description="Confirm extracted fields before saving. Cancel dates will appear on the timeline."
        footer={
          <>
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
          </>
        }
      >
        <ReviewSummaryGrid>
          <ReviewSummaryItem label="Buyer" value={parsed.buyer_name} />
          <ReviewSummaryItem
            label="PO #"
            value={parsed.vendor_po_number ?? parsed.order_number ?? "—"}
          />
          <ReviewSummaryItem label="Order date" value={parsed.order_date} />
          <ReviewSummaryItem
            label="Total units"
            value={
              <span className="num">
                {parsed.total_units.toLocaleString()}
              </span>
            }
          />
          <ReviewSummaryItem
            label="Total"
            value={
              <span className="num">{formatUsd(parsed.total_price, 2)}</span>
            }
          />
          {parsed.season ? (
            <ReviewSummaryItem label="Season" value={parsed.season} />
          ) : null}
        </ReviewSummaryGrid>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Line items</h3>
          <ParsedLineItemsList
            items={parsed.line_items.map((item, i) => ({
              key: `${item.style_number ?? item.product_name}-${i}`,
              title: item.product_name,
              subtitle: [item.revolve_code, item.color]
                .filter(Boolean)
                .join(" · "),
              quantity: item.quantity,
              trailing: (
                <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-xs num">
                  <span>{formatUsd(item.unit_price, 2)}/unit</span>
                  <span className="text-destructive">
                    Cancel {item.cancel_date}
                  </span>
                </div>
              ),
            }))}
          />
        </div>
      </ReviewDialogShell>
    </Dialog>
  );
}
