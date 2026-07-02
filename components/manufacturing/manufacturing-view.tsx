"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteRun } from "@/lib/actions/manufacturing";
import { CorrespondencePanel } from "@/components/inbound/correspondence-panel";
import { ManufacturingBoard } from "@/components/manufacturing/manufacturing-board";
import { ManufacturingTable } from "@/components/manufacturing/manufacturing-table";
import { MoReviewDialog } from "@/components/manufacturing/mo-review-dialog";
import { MoUploadDropzone } from "@/components/manufacturing/mo-upload";
import { RunForm } from "@/components/manufacturing/run-form";
import type { ParsedManufacturingOrder } from "@/lib/manufacturing/parse-schema";
import type {
  ManufacturingRunRow,
  ProductOption,
  PurchaseOrderOption,
  VendorOption,
} from "@/components/manufacturing/types";
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
import { PageHeader } from "@/components/nav/page-header";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ManufacturingView({
  initialRuns,
  vendors,
  purchaseOrders,
  products,
  initialCreateOpen = false,
  initialUploadOpen = false,
}: {
  initialRuns: ManufacturingRunRow[];
  vendors: VendorOption[];
  purchaseOrders: PurchaseOrderOption[];
  products: ProductOption[];
  initialCreateOpen?: boolean;
  initialUploadOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen);
  const [uploadOpen, setUploadOpen] = React.useState(initialUploadOpen);
  const [parsedMo, setParsedMo] = React.useState<ParsedManufacturingOrder | null>(
    null,
  );
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ManufacturingRunRow | null>(
    null,
  );
  const [deleting, setDeleting] = React.useState<ManufacturingRunRow | null>(
    null,
  );
  const [deletePending, startDeleteTransition] = React.useTransition();

  const boardKey = initialRuns
    .map((r) => `${r.id}:${r.updated_at}:${r.stage}`)
    .join("|");

  const openCreateFromQuery = searchParams.get("new") === "1";
  const openUploadFromQuery = searchParams.get("upload") === "1";
  const createSheetOpen = createOpen || openCreateFromQuery;
  const uploadSheetOpen = uploadOpen || openUploadFromQuery;

  function openCreateSheet() {
    setCreateOpen(true);
  }

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open && openCreateFromQuery) {
      router.replace("/manufacturing");
    }
  }

  function closeCreateSheet() {
    handleCreateOpenChange(false);
  }

  function handleUploadOpenChange(open: boolean) {
    setUploadOpen(open);
    if (!open && openUploadFromQuery) {
      router.replace("/manufacturing");
    }
  }

  function handleMoParsed(data: ParsedManufacturingOrder) {
    setParsedMo(data);
    setReviewOpen(true);
    handleUploadOpenChange(false);
  }

  function handleMutationSuccess(closeSheet: () => void) {
    closeSheet();
    router.refresh();
  }

  function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    startDeleteTransition(async () => {
      const result = await deleteRun(target.id);
      if (result.ok) {
        toast.success(`Deleted ${target.product_name}`);
        setDeleting(null);
        setEditing(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <>
      <div className="space-y-4">
        <PageHeader
          title="Manufacturing"
          description="Production runs from order through arrival."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(true)}>
                <FileUp />
                Upload proforma
              </Button>
              <Button onClick={openCreateSheet}>
                <Plus />
                New run
              </Button>
            </div>
          }
        >
          <Tabs defaultValue="board" className="gap-4">
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>

            <TabsContent value="board">
              {initialRuns.length === 0 ? (
                <EmptyState
                  title="No production runs yet"
                  description="Upload a factory proforma to create a run, or log one manually."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <EmptyStateAction onClick={() => setUploadOpen(true)}>
                        Upload proforma
                      </EmptyStateAction>
                      <EmptyStateAction onClick={openCreateSheet}>
                        New run
                      </EmptyStateAction>
                    </div>
                  }
                />
              ) : (
                <ManufacturingBoard
                  key={boardKey}
                  runs={initialRuns}
                  onOpenRun={setEditing}
                />
              )}
            </TabsContent>

            <TabsContent value="list">
              {initialRuns.length === 0 ? (
                <EmptyState
                  title="No production runs yet"
                  description="Upload a factory proforma to create a run, or log one manually."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <EmptyStateAction onClick={() => setUploadOpen(true)}>
                        Upload proforma
                      </EmptyStateAction>
                      <EmptyStateAction onClick={openCreateSheet}>
                        New run
                      </EmptyStateAction>
                    </div>
                  }
                />
              ) : (
                <ManufacturingTable
                  runs={initialRuns}
                  onOpenRun={setEditing}
                  onDeleteRun={setDeleting}
                />
              )}
            </TabsContent>
          </Tabs>
        </PageHeader>
      </div>

      <Sheet open={uploadSheetOpen} onOpenChange={handleUploadOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Upload proforma</SheetTitle>
            <SheetDescription>
              Factory PI or order confirmation — we create a production run from
              the main product line.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <MoUploadDropzone onParsed={handleMoParsed} />
          </div>
        </SheetContent>
      </Sheet>

      <MoReviewDialog
        parsed={parsedMo}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />

      <Sheet open={createSheetOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New run</SheetTitle>
            <SheetDescription>Log a production run.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <RunForm
              vendors={vendors}
              purchaseOrders={purchaseOrders}
              products={products}
              onSuccess={() => handleMutationSuccess(closeCreateSheet)}
              onCancel={closeCreateSheet}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit run</SheetTitle>
            <SheetDescription>{editing?.product_name ?? ""}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {editing ? (
              <>
                <RunForm
                  run={editing}
                  vendors={vendors}
                  purchaseOrders={purchaseOrders}
                  products={products}
                  onSuccess={() =>
                    handleMutationSuccess(() => setEditing(null))
                  }
                  onCancel={() => setEditing(null)}
                  onDeleted={() => handleMutationSuccess(() => setEditing(null))}
                />
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-medium">Correspondence</h3>
                  <CorrespondencePanel
                    entityType="manufacturing_run"
                    entityId={editing.id}
                  />
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete run?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleting?.product_name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
