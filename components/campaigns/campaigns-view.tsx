"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CampaignDetailSheet } from "@/components/campaigns/campaign-detail-sheet";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignSummary } from "@/components/campaigns/campaign-summary";
import { CampaignTable } from "@/components/campaigns/campaign-table";
import { CampaignTaskBoard } from "@/components/campaigns/campaign-task-board";
import type { BoardTaskRow, CampaignRow } from "@/components/campaigns/types";
import { flattenBoardTasks } from "@/components/campaigns/types";
import { deleteCampaign } from "@/lib/actions/campaigns";
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

export function CampaignsView({
  campaigns: initialCampaigns,
  initialCreateOpen = false,
}: {
  campaigns: CampaignRow[];
  initialCreateOpen?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen);
  const [selected, setSelected] = React.useState<CampaignRow | null>(null);
  const [deleting, setDeleting] = React.useState<CampaignRow | null>(null);
  const [deletePending, startDeleteTransition] = React.useTransition();

  const openCreateFromQuery = searchParams.get("new") === "1";
  const createSheetOpen = createOpen || openCreateFromQuery;

  const boardTasks = flattenBoardTasks(initialCampaigns);
  const boardKey = boardTasks
    .map((t) => `${t.id}:${t.status}:${t.due_date ?? ""}`)
    .join("|");

  const visibleCampaigns = initialCampaigns.filter(
    (c) => c.status !== "archived",
  );

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    if (!open && openCreateFromQuery) {
      router.replace("/campaigns");
    }
  }

  function closeCreateSheet() {
    handleCreateOpenChange(false);
  }

  function handleMutationSuccess(closeSheet?: () => void) {
    closeSheet?.();
    router.refresh();
  }

  function openCampaign(campaign: CampaignRow) {
    setSelected(campaign);
  }

  function openCampaignById(campaignId: string) {
    const campaign = initialCampaigns.find((c) => c.id === campaignId);
    if (campaign) setSelected(campaign);
  }

  function handleBoardTaskOpen(task: BoardTaskRow) {
    openCampaignById(task.campaign_id);
  }

  function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    startDeleteTransition(async () => {
      const result = await deleteCampaign(target.id);
      if (result.ok) {
        toast.success(`Deleted ${target.name}`);
        setDeleting(null);
        setSelected(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  React.useEffect(() => {
    if (!selected) return;
    const fresh = initialCampaigns.find((c) => c.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [initialCampaigns, selected]);

  return (
    <>
      <div className="space-y-4">
        <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Campaigns
              </h1>
              <p className="text-sm text-muted-foreground">
                Plan launches, promos, and email pushes — with tasks and links
                to Klaviyo, Canva, Shopify, and HubSpot.
              </p>
            </div>
            <Button className="shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus />
              New campaign
            </Button>
          </div>

          {initialCampaigns.length > 0 ? (
            <div className="mt-4">
              <CampaignSummary campaigns={initialCampaigns} />
            </div>
          ) : null}

          <Tabs defaultValue="board" className="mt-4 gap-4">
            <TabsList>
              <TabsTrigger value="board">Task board</TabsTrigger>
              <TabsTrigger value="list">Campaigns</TabsTrigger>
            </TabsList>

            <TabsContent value="board">
              {boardTasks.length === 0 ? (
                <EmptyState
                  title="No campaign tasks yet"
                  description="Create a campaign to get a starter checklist — tasks appear here for drag-and-drop tracking."
                  action={
                    <EmptyStateAction onClick={() => setCreateOpen(true)}>
                      New campaign
                    </EmptyStateAction>
                  }
                />
              ) : (
                <CampaignTaskBoard
                  key={boardKey}
                  tasks={boardTasks}
                  onOpenTask={handleBoardTaskOpen}
                />
              )}
            </TabsContent>

            <TabsContent value="list">
              {visibleCampaigns.length === 0 ? (
                <EmptyState
                  title="No campaigns yet"
                  description="Start with a product launch, seasonal promo, or DTC email push."
                  action={
                    <EmptyStateAction onClick={() => setCreateOpen(true)}>
                      New campaign
                    </EmptyStateAction>
                  }
                />
              ) : (
                <CampaignTable
                  campaigns={initialCampaigns}
                  onOpenCampaign={openCampaign}
                  onDeleteCampaign={setDeleting}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>New campaign</SheetTitle>
            <SheetDescription>
              Pick a type to get a starter checklist tailored for ecomm.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <CampaignForm
              onSuccess={() => handleMutationSuccess(closeCreateSheet)}
              onCancel={closeCreateSheet}
            />
          </div>
        </SheetContent>
      </Sheet>

      <CampaignDetailSheet
        campaign={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onUpdated={() => handleMutationSuccess()}
      />

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete campaign?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleting?.name}
              </span>{" "}
              and all of its tasks and links.
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
