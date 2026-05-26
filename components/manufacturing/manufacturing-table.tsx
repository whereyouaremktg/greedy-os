"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { updateRunStage } from "@/lib/actions/manufacturing";
import { formatDaysToBadge, getArrivalPillVariant } from "@/lib/manufacturing/dates";
import {
  MANUFACTURING_STAGES,
  formatStageLabel,
  type ManufacturingStage,
} from "@/lib/manufacturing/stages";
import { RelativeTime } from "@/components/relative-time";
import type { ManufacturingRunRow } from "@/components/manufacturing/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortKey =
  | "product_name"
  | "vendor_name"
  | "quantity"
  | "stage"
  | "expected_arrival_date";

type SortDir = "asc" | "desc";

function SortButton({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 text-left text-[13px] font-medium hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      onClick={onClick}
    >
      {label}
      <Icon className="size-3 opacity-60" />
    </button>
  );
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function ManufacturingTable({
  runs,
  onOpenRun,
  onDeleteRun,
}: {
  runs: ManufacturingRunRow[];
  onOpenRun: (run: ManufacturingRunRow) => void;
  onDeleteRun: (run: ManufacturingRunRow) => void;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>("expected_arrival_date");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [, startTransition] = React.useTransition();

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "expected_arrival_date" ? "asc" : "asc");
    }
  }

  const sorted = React.useMemo(() => {
    const copy = [...runs];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortKey) {
        case "product_name":
          return a.product_name.localeCompare(b.product_name) * dir;
        case "vendor_name":
          return a.vendor_name.localeCompare(b.vendor_name) * dir;
        case "quantity":
          return (a.quantity - b.quantity) * dir;
        case "stage":
          return (
            MANUFACTURING_STAGES.indexOf(a.stage) -
            MANUFACTURING_STAGES.indexOf(b.stage)
          ) * dir;
        case "expected_arrival_date":
          return compareNullableDate(a.expected_arrival_date, b.expected_arrival_date) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [runs, sortKey, sortDir]);

  function moveToStage(run: ManufacturingRunRow, stage: ManufacturingStage) {
    startTransition(async () => {
      const result = await updateRunStage(run.id, stage);
      if (result.ok) {
        toast.success(`Moved to ${formatStageLabel(stage)}`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortButton
                label="Product"
                active={sortKey === "product_name"}
                dir={sortDir}
                onClick={() => toggleSort("product_name")}
              />
            </TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>
              <SortButton
                label="Vendor"
                active={sortKey === "vendor_name"}
                dir={sortDir}
                onClick={() => toggleSort("vendor_name")}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortButton
                label="Qty"
                active={sortKey === "quantity"}
                dir={sortDir}
                onClick={() => toggleSort("quantity")}
                className="ml-auto"
              />
            </TableHead>
            <TableHead>
              <SortButton
                label="Stage"
                active={sortKey === "stage"}
                dir={sortDir}
                onClick={() => toggleSort("stage")}
              />
            </TableHead>
            <TableHead>
              <SortButton
                label="Expected arrival"
                active={sortKey === "expected_arrival_date"}
                dir={sortDir}
                onClick={() => toggleSort("expected_arrival_date")}
              />
            </TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((run) => {
            const pill = getArrivalPillVariant(
              run.expected_arrival_date,
              run.stage,
            );
            return (
              <TableRow
                key={run.id}
                className="group cursor-pointer"
                onClick={() => onOpenRun(run)}
              >
                <TableCell className="font-medium">{run.product_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {run.variant ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {run.vendor_name}
                </TableCell>
                <TableCell className="num text-right">
                  {run.quantity.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{formatStageLabel(run.stage)}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums">
                      {run.expected_arrival_date ?? "—"}
                    </span>
                    {run.expected_arrival_date ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                          pill === "overdue" &&
                            "bg-destructive/10 text-destructive",
                          pill === "soon" &&
                            "bg-warning/15 text-warning-foreground dark:text-warning",
                          pill === "neutral" &&
                            "bg-muted text-muted-foreground",
                        )}
                      >
                        {formatDaysToBadge(run.expected_arrival_date)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <RelativeTime iso={run.updated_at} />
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="inline-flex opacity-0 outline-none group-hover:opacity-100 data-popup-open:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${run.product_name}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => onOpenRun(run)}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Move to stage</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {MANUFACTURING_STAGES.filter((s) => s !== run.stage).map(
                            (stage) => (
                              <DropdownMenuItem
                                key={stage}
                                onClick={() => moveToStage(run, stage)}
                              >
                                {formatStageLabel(stage)}
                              </DropdownMenuItem>
                            ),
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDeleteRun(run)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
