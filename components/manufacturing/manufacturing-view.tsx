"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteRun } from "@/lib/actions/manufacturing";
import { ManufacturingBoard } from "@/components/manufacturing/manufacturing-board";
import { ManufacturingTable } from "@/components/manufacturing/manufacturing-table";
import { RunForm } from "@/components/manufacturing/run-form";
import type {
  ManufacturingRunRow,
  PurchaseOrderOption,
  VendorOption,
} from "@/components/manufacturing/types";
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
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
  initialCreateOpen = false,
}: {
  initialRuns: ManufacturingRunRow[];
  vendors: VendorOption[];
  purchaseOrders: PurchaseOrderOption[];
  initialCreateOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen);
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
  const createSheetOpen = createOpen || openCreateFromQuery;

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
        <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Manufacturing
              </h1>
              <p className="text-sm text-muted-foreground">
                Production runs from order through arrival.
              </p>
            </div>
            <Button onClick={openCreateSheet}>
              <Plus />
              New run
            </Button>
          </div>

          <Tabs defaultValue="board" className="mt-4 gap-4">
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
            </TabsList>

            <TabsContent value="board">
              {initialRuns.length === 0 ? (
                <EmptyState
                  title="No production runs yet"
                  description="Track manufacturing from order through arrival. Forward an order confirmation to the AI or click New run to log one."
                  action={
                    <EmptyStateAction onClick={openCreateSheet}>
                      New run
                    </EmptyStateAction>
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
                  description="Track manufacturing from order through arrival. Forward an order confirmation to the AI or click New run to log one."
                  action={
                    <EmptyStateAction onClick={openCreateSheet}>
                      New run
                    </EmptyStateAction>
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
        </div>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New run</SheetTitle>
            <SheetDescription>Log a production run.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <RunForm
              vendors={vendors}
              purchaseOrders={purchaseOrders}
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
              <RunForm
                run={editing}
                vendors={vendors}
                purchaseOrders={purchaseOrders}
                onSuccess={() =>
                  handleMutationSuccess(() => setEditing(null))
                }
                onCancel={() => setEditing(null)}
                onDeleted={() => handleMutationSuccess(() => setEditing(null))}
              />
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
