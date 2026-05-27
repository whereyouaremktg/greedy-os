"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

import type { CampaignRow } from "@/components/campaigns/types";
import { taskProgress } from "@/components/campaigns/types";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
} from "@/lib/campaigns/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function statusBadgeVariant(
  status: CampaignRow["status"],
): "default" | "secondary" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "planning":
      return "secondary";
    default:
      return "outline";
  }
}

function formatDateRange(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return "—";
  const fmt = (d: string) => format(parseISO(d), "MMM d");
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  return end ? fmt(end!) : "—";
}

export function CampaignTable({
  campaigns,
  onOpenCampaign,
  onDeleteCampaign,
}: {
  campaigns: CampaignRow[];
  onOpenCampaign: (campaign: CampaignRow) => void;
  onDeleteCampaign: (campaign: CampaignRow) => void;
}) {
  const visible = campaigns.filter((c) => c.status !== "archived");

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Window</TableHead>
            <TableHead className="text-right">Tasks</TableHead>
            <TableHead className="text-right">Links</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((campaign) => {
            const progress = taskProgress(campaign.tasks);
            return (
              <TableRow
                key={campaign.id}
                className="cursor-pointer"
                onClick={() => onOpenCampaign(campaign)}
              >
                <TableCell className="font-medium">{campaign.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {CAMPAIGN_TYPE_LABELS[campaign.type]}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(campaign.status)}>
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDateRange(campaign.start_date, campaign.end_date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {progress.total === 0 ? (
                    "—"
                  ) : (
                    <span
                      className={cn(
                        progress.done === progress.total &&
                          "text-muted-foreground",
                      )}
                    >
                      {progress.done}/{progress.total}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {campaign.links.length || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${campaign.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCampaign(campaign);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function CampaignLinkIcon() {
  return <ExternalLink className="size-3.5" />;
}
