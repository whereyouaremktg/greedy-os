"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
import { PoDetailSheet, type PoDetail } from "@/components/purchase-orders/po-detail-sheet";
import { PoReviewDialog } from "@/components/purchase-orders/po-review-dialog";
import { PoUploadDropzone } from "@/components/purchase-orders/po-upload";
import { formatUsd } from "@/lib/format";
import { getPurchaseOrderDetail } from "@/lib/actions/purchase-orders";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";
import { cn } from "@/lib/utils";

export type PoRow = {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  total: number;
  vendor_name: string;
  line_item_count: number;
  total_units: number;
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PoTable({
  orders,
  initialUploadOpen = false,
}: {
  orders: PoRow[];
  initialUploadOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = React.useState(initialUploadOpen);
  const [parsed, setParsed] = React.useState<ParsedPurchaseOrder | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<PoDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);

  const openUploadFromQuery = searchParams.get("new") === "1";
  const uploadSheetOpen = uploadOpen || openUploadFromQuery;

  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open);
    if (!open && openUploadFromQuery) {
      router.replace("/purchase-orders");
    }
  }

  function handleParsed(data: ParsedPurchaseOrder) {
    setParsed(data);
    setReviewOpen(true);
    handleUploadOpenChange(false);
  }

  async function openPoDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);

    const result = await getPurchaseOrderDetail(id);
    setDetailLoading(false);

    if (result.ok) {
      setDetail(result.data);
    } else {
      setDetailError(result.error);
    }
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) {
      setDetail(null);
      setDetailError(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground">
            Wholesale buyer POs — upload a document to extract line items and
            cancel dates for the timeline.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <FileUp />
          Upload PO
        </Button>
      </div>

      <div className="rounded-md border">
        {orders.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            description="Upload a wholesale PO (e.g. REVOLVE) and we'll extract styles, quantities, pricing, and cancel dates."
            action={
              <EmptyStateAction onClick={() => setUploadOpen(true)}>
                Upload PO
              </EmptyStateAction>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead>Latest cancel</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((po) => (
                <TableRow
                  key={po.id}
                  className="cursor-pointer"
                  onClick={() => void openPoDetail(po.id)}
                >
                  <TableCell className="font-medium">
                    {po.po_number ?? "—"}
                  </TableCell>
                  <TableCell>{po.vendor_name}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] capitalize",
                        po.status === "confirmed"
                          ? "bg-brand/10 text-brand"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatStatus(po.status)}
                    </span>
                  </TableCell>
                  <TableCell>{formatDate(po.order_date)}</TableCell>
                  <TableCell className="text-destructive">
                    {formatDate(po.expected_date)}
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
        )}
      </div>

      <Sheet open={uploadSheetOpen} onOpenChange={handleUploadOpenChange}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Upload purchase order</SheetTitle>
            <SheetDescription>
              Upload a PDF or screenshot. We&apos;ll extract header info, line
              items, and per-style cancel dates.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <PoUploadDropzone onParsed={handleParsed} />
          </div>
        </SheetContent>
      </Sheet>

      <PoReviewDialog
        parsed={parsed}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />

      <PoDetailSheet
        detail={detail}
        loading={detailLoading}
        error={detailError}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
      />
    </>
  );
}
