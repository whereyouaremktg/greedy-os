"use client";

import * as React from "react";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CampaignForm } from "@/components/campaigns/campaign-form";
import type { CampaignRow } from "@/components/campaigns/types";
import { taskProgress } from "@/components/campaigns/types";
import {
  createLink,
  createTask,
  deleteLink,
  deleteTask,
  updateTaskStatus,
} from "@/lib/actions/campaigns";
import {
  CAMPAIGN_LINK_SOURCES,
  CAMPAIGN_LINK_SOURCE_LABELS,
  CAMPAIGN_TASK_STATUS_LABELS,
} from "@/lib/campaigns/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function CampaignDetailSheet({
  campaign,
  open,
  onOpenChange,
  onUpdated,
}: {
  campaign: CampaignRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskPending, startTaskTransition] = React.useTransition();
  const [linkLabel, setLinkLabel] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkSource, setLinkSource] =
    React.useState<(typeof CAMPAIGN_LINK_SOURCES)[number]>("klaviyo");
  const [linkPending, startLinkTransition] = React.useTransition();

  if (!campaign) return null;

  const campaignId = campaign.id;
  const progress = taskProgress(campaign.tasks);

  function handleMutationSuccess() {
    onUpdated();
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;

    startTaskTransition(async () => {
      const result = await createTask({
        campaign_id: campaignId,
        title,
        owner: "",
        due_date: "",
      });
      if (result.ok) {
        toast.success("Task added");
        setTaskTitle("");
        handleMutationSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleToggleTask(taskId: string, current: CampaignRow["tasks"][0]["status"]) {
    const next =
      current === "todo"
        ? "in_progress"
        : current === "in_progress"
          ? "done"
          : "todo";

    startTaskTransition(async () => {
      const result = await updateTaskStatus(taskId, next);
      if (result.ok) {
        handleMutationSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDeleteTask(taskId: string) {
    startTaskTransition(async () => {
      const result = await deleteTask(taskId);
      if (result.ok) {
        toast.success("Task removed");
        handleMutationSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    startLinkTransition(async () => {
      const result = await createLink({
        campaign_id: campaignId,
        label: linkLabel,
        url: linkUrl,
        source: linkSource,
      });
      if (result.ok) {
        toast.success("Link added");
        setLinkLabel("");
        setLinkUrl("");
        handleMutationSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleDeleteLink(linkId: string) {
    startLinkTransition(async () => {
      const result = await deleteLink(linkId);
      if (result.ok) {
        toast.success("Link removed");
        handleMutationSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{campaign.name}</SheetTitle>
          <SheetDescription>
            {progress.total > 0
              ? `${progress.done} of ${progress.total} tasks complete`
              : "Campaign details, tasks, and external links"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          <CampaignForm
            campaign={campaign}
            onSuccess={handleMutationSuccess}
          />

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Tasks</h3>
              {progress.total > 0 ? (
                <Badge variant="secondary" className="num">
                  {progress.done}/{progress.total}
                </Badge>
              ) : null}
            </div>

            <ul className="space-y-2">
              {campaign.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-start gap-2 rounded-md border px-3 py-2"
                >
                  <button
                    type="button"
                    disabled={taskPending}
                    onClick={() => handleToggleTask(task.id, task.status)}
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                      task.status === "done" &&
                        "border-success/40 bg-success/10 text-success",
                      task.status === "in_progress" &&
                        "border-brand/40 bg-brand/10 text-brand",
                      task.status === "todo" &&
                        "border-border bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {CAMPAIGN_TASK_STATUS_LABELS[task.status]}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-snug",
                        task.status === "done" &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {task.title}
                    </p>
                    {task.due_date ? (
                      <p className="num mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        Due {task.due_date}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${task.title}`}
                    disabled={taskPending}
                    onClick={() => handleDeleteTask(task.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAddTask} className="flex gap-2">
              <Input
                placeholder="Add a task..."
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={taskPending}
              />
              <Button type="submit" size="sm" disabled={taskPending || !taskTitle.trim()}>
                <Plus />
                Add
              </Button>
            </form>
          </section>

          <Separator />

          <section className="space-y-3">
            <h3 className="text-sm font-medium">External links</h3>
            <p className="text-xs text-muted-foreground">
              Klaviyo flows, Canva designs, Shopify collections, HubSpot sequences.
            </p>

            {campaign.links.length > 0 ? (
              <ul className="space-y-2">
                {campaign.links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {CAMPAIGN_LINK_SOURCE_LABELS[link.source]}
                        </Badge>
                        <span className="truncate text-sm font-medium">
                          {link.label}
                        </span>
                      </div>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3 shrink-0" />
                        {link.url}
                      </a>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${link.label}`}
                      disabled={linkPending}
                      onClick={() => handleDeleteLink(link.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <form onSubmit={handleAddLink} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Label"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  disabled={linkPending}
                />
                <Select
                  value={linkSource}
                  onChange={(e) =>
                    setLinkSource(
                      e.target.value as (typeof CAMPAIGN_LINK_SOURCES)[number],
                    )
                  }
                  disabled={linkPending}
                >
                  {CAMPAIGN_LINK_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {CAMPAIGN_LINK_SOURCE_LABELS[source]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  disabled={linkPending}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={linkPending || !linkLabel.trim() || !linkUrl.trim()}
                >
                  <Plus />
                  Add
                </Button>
              </div>
            </form>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
