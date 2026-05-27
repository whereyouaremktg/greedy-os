"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp } from "lucide-react";

import { PoBoard } from "@/components/purchase-orders/po-board";
import {
  PoDetailSheet,
  type PoDetail,
} from "@/components/purchase-orders/po-detail-sheet";
import { PoListTable } from "@/components/purchase-orders/po-list-table";
import { PoReviewDialog } from "@/components/purchase-orders/po-review-dialog";
import { PoUploadDropzone } from "@/components/purchase-orders/po-upload";
import type { PoRow } from "@/components/purchase-orders/types";
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPurchaseOrderDetail } from "@/lib/actions/purchase-orders";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";
import { isPoOnBoard } from "@/lib/purchase-orders/statuses";

export function PoView({
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

  const boardOrders = orders.filter((o) => isPoOnBoard(o.status));
  const boardKey = boardOrders
    .map((o) => `${o.id}:${o.updated_at}:${o.status}`)
    .join("|");

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

  async function openPoDetail(order: PoRow) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setDetailError(null);

    const result = await getPurchaseOrderDetail(order.id);
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

  function handleDetailSaved() {
    router.refresh();
  }

  const emptyState = (
    <EmptyState
      title="No purchase orders yet"
      description="Upload a wholesale PO (e.g. REVOLVE) and we'll extract styles, quantities, pricing, and cancel dates."
      action={
        <EmptyStateAction onClick={() => setUploadOpen(true)}>
          Upload PO
        </EmptyStateAction>
      }
    />
  );

  return (
    <>
      <div className="space-y-4">
        <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Purchase Orders
              </h1>
              <p className="text-sm text-muted-foreground">
                Wholesale buyer POs — track fulfillment, shipment, and payment.
              </p>
            </div>
            <Button className="shrink-0" onClick={() => setUploadOpen(true)}>
              <FileUp />
              Upload PO
            </Button>
          </div>

          <Tabs defaultValue="board" className="mt-4 gap-4">
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>

            <TabsContent value="board">
              {boardOrders.length === 0 ? emptyState : (
                <PoBoard
                  key={boardKey}
                  orders={boardOrders}
                  onOpenOrder={(order) => void openPoDetail(order)}
                />
              )}
            </TabsContent>

            <TabsContent value="list">
              {orders.length === 0 ? (
                emptyState
              ) : (
                <PoListTable
                  orders={orders}
                  onOpenOrder={(order) => void openPoDetail(order)}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
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
        onSaved={handleDetailSaved}
      />
    </>
  );
}
