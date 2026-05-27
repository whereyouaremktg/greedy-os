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
import { LandedMarginPanel } from "@/components/costing/landed-margin-panel";
import { createRunFromParsed } from "@/lib/actions/manufacturing";
import {
  formatCostingNotes,
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
      const costingNotes = costingResult
        ? formatCostingNotes(costingResult)
        : undefined;
      const result = await createRunFromParsed(parsed, { costingNotes });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review parsed manufacturing order</DialogTitle>
          <DialogDescription>
            We&apos;ll create one production run for the main product line.
            Cartons and fees are saved in notes.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Factory</dt>
            <dd className="font-medium">{parsed.vendor_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PI #</dt>
            <dd className="font-medium">{parsed.pi_number ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Order date</dt>
            <dd className="font-medium">{parsed.order_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Product (run)</dt>
            <dd className="font-medium">{productName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="num font-medium">
              {primary.quantity.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expected arrival</dt>
            <dd className="font-medium">
              {parsed.expected_arrival_date ?? "—"}
            </dd>
          </div>
          {parsed.total_amount_usd != null ? (
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="num font-medium">
                {formatUsd(parsed.total_amount_usd, 2)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.line_items.map((item, i) => (
                <TableRow key={`${item.description}-${i}`}>
                  <TableCell>
                    <div className="font-medium">{item.description}</div>
                    {item.variant ? (
                      <div className="text-xs text-muted-foreground">
                        {item.variant}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-right">
                    {item.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {item === primary
                      ? "→ Run"
                      : isAncillaryLine(item)
                        ? "Notes"
                        : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <LandedMarginPanel
          key={parsed.pi_number ?? parsed.vendor_name}
          quantity={primary.quantity}
          defaultProductCostUsd={productCostUsd}
          productCostLabel="Factory invoice total (USD)"
          sellPriceLabel="Sell price / unit (DTC or wholesale)"
          onResultChange={setCostingResult}
        />

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
