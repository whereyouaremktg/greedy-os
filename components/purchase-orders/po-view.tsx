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
import { PageHeader } from "@/components/nav/page-header";
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

  const openIdFromQuery = searchParams.get("open");
  const handledOpenIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!openIdFromQuery) {
      handledOpenIdRef.current = null;
      return;
    }
    if (handledOpenIdRef.current === openIdFromQuery) return;
    const timer = setTimeout(() => {
      handledOpenIdRef.current = openIdFromQuery;
      // Open by id directly — the detail sheet fetches and has its own
      // loading/error states, so this works even for POs beyond the
      // server-fetched list (and surfaces an error for deleted ones).
      void openPoDetail({ id: openIdFromQuery });
      router.replace("/purchase-orders");
    }, 0);
    return () => clearTimeout(timer);
  }, [openIdFromQuery, orders, router]);

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

  async function openPoDetail(order: Pick<PoRow, "id">) {
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

  function handleDetailDeleted() {
    handleDetailOpenChange(false);
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
        <PageHeader
          title="Purchase Orders"
          description="Wholesale buyer POs — track fulfillment, shipment, and payment."
          actions={
            <Button onClick={() => setUploadOpen(true)}>
              <FileUp />
              Upload PO
            </Button>
          }
        >
          <Tabs defaultValue="board" className="gap-4">
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
        </PageHeader>
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
        onDeleted={handleDetailDeleted}
      />
    </>
  );
}
