"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LandedMarginPanel } from "@/components/costing/landed-margin-panel";
import {
  ParsedLineItemsList,
  ReviewDialogShell,
  ReviewHighlightCard,
  ReviewSummaryGrid,
  ReviewSummaryItem,
} from "@/components/documents/review-dialog-shell";
import { createRunFromParsed } from "@/lib/actions/manufacturing";
import {
  landedMarginResultToRunCosting,
  manufacturingProductCostUsd,
  type LandedMarginResult,
} from "@/lib/costing/landed-margin";
import { formatUsd } from "@/lib/format";
import {
  isAncillaryLine,
  pickPrimaryLineItem,
  productNameFromLine,
} from "@/lib/manufacturing/from-parsed";
import type { ParsedManufacturingOrder } from "@/lib/manufacturing/parse-schema";

type Props = {
  parsed: ParsedManufacturingOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MoReviewDialog({ parsed, open, onOpenChange }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [costingResult, setCostingResult] =
    React.useState<LandedMarginResult | null>(null);

  async function handleSave() {
    if (!parsed) return;

    setSubmitting(true);
    try {
      const result = await createRunFromParsed(parsed, {
        costing: costingResult
          ? landedMarginResultToRunCosting(costingResult)
          : undefined,
      });
      if (result.ok) {
        toast.success(
          `Created run — ${result.data.quantity.toLocaleString()} ${result.data.product_name} (${result.data.vendor_name})`,
        );
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!parsed) return null;

  const primary = pickPrimaryLineItem(parsed);
  const productName = productNameFromLine(primary);
  const productCostUsd = manufacturingProductCostUsd(parsed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ReviewDialogShell
        title="Review parsed manufacturing order"
        description="We'll create one production run for the main product line. Cartons and fees are saved in notes."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Creating…
                </>
              ) : (
                "Create run"
              )}
            </Button>
          </>
        }
      >
        <ReviewSummaryGrid>
          <ReviewSummaryItem label="Factory" value={parsed.vendor_name} />
          <ReviewSummaryItem
            label="PI #"
            value={parsed.pi_number ?? "—"}
          />
          <ReviewSummaryItem
            label="Order date"
            value={parsed.order_date ?? "—"}
          />
          <ReviewSummaryItem
            label="Expected arrival"
            value={parsed.expected_arrival_date ?? "—"}
          />
          {parsed.total_amount_usd != null ? (
            <ReviewSummaryItem
              label="Total"
              value={
                <span className="num">{formatUsd(parsed.total_amount_usd, 2)}</span>
              }
            />
          ) : null}
          <ReviewHighlightCard
            label="Product (run)"
            title={productName}
            meta={
              <span className="num font-medium text-foreground">
                {primary.quantity.toLocaleString()} units
              </span>
            }
          />
        </ReviewSummaryGrid>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Line items</h3>
          <ParsedLineItemsList
            items={parsed.line_items.map((item, i) => ({
              key: `${item.description}-${i}`,
              title: item.description,
              subtitle: item.variant,
              quantity: item.quantity,
              badge:
                item === primary
                  ? "→ Run"
                  : isAncillaryLine(item)
                    ? "Notes"
                    : undefined,
            }))}
          />
        </div>

        <LandedMarginPanel
          key={parsed.pi_number ?? parsed.vendor_name}
          quantity={primary.quantity}
          defaultProductCostUsd={productCostUsd}
          productCostLabel="Factory invoice total (USD)"
          sellPriceLabel="Sell price / unit (DTC or wholesale)"
          onResultChange={setCostingResult}
        />
      </ReviewDialogShell>
    </Dialog>
  );
}
