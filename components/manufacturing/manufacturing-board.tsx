"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { updateRunStage } from "@/lib/actions/manufacturing";
import {
  formatArrivalLabel,
  getArrivalPillVariant,
  todayIso,
} from "@/lib/manufacturing/dates";
import {
  MANUFACTURING_STAGES,
  STAGE_LABELS,
  type ManufacturingStage,
} from "@/lib/manufacturing/stages";
import { usePrefersReducedMotion } from "@/components/relative-time";
import type { ManufacturingRunRow } from "@/components/manufacturing/types";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function applyStageSideEffects(
  run: ManufacturingRunRow,
  stage: ManufacturingStage,
): ManufacturingRunRow {
  const next = { ...run, stage };
  if (stage === "complete" && !next.actual_completion_date) {
    next.actual_completion_date = todayIso();
  }
  if (stage === "received" && !next.actual_arrival_date) {
    next.actual_arrival_date = todayIso();
  }
  return next;
}

function ArrivalPill({
  expectedArrival,
  stage,
}: {
  expectedArrival: string | null;
  stage: ManufacturingStage;
}) {
  const variant = getArrivalPillVariant(expectedArrival, stage);
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
        variant === "overdue" &&
          "bg-destructive/10 text-destructive dark:bg-destructive/20",
        variant === "soon" &&
          "bg-warning/15 text-warning-foreground dark:text-warning",
        variant === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {formatArrivalLabel(expectedArrival)}
    </span>
  );
}

function RunCardContent({
  run,
  isDragging = false,
}: {
  run: ManufacturingRunRow;
  isDragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-left shadow-xs transition-colors",
        "hover:border-brand/40",
        isDragging && "border-brand/50 shadow-sm",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-tight">
            {run.product_name}
          </p>
          {run.variant ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {run.variant}
            </p>
          ) : null}
        </div>
        {run.notes ? (
          <Tooltip>
            <TooltipTrigger
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="View notes"
              onClick={(e) => e.stopPropagation()}
            >
              <StickyNote className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs whitespace-pre-wrap">
              {run.notes}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{run.vendor_name}</span>
        <span className="num shrink-0">{run.quantity.toLocaleString()}</span>
      </div>
      <div className="mt-2">
        <ArrivalPill
          expectedArrival={run.expected_arrival_date}
          stage={run.stage}
        />
      </div>
    </div>
  );
}

function DraggableRunCard({
  run,
  onOpen,
  reducedMotion,
}: {
  run: ManufacturingRunRow;
  onOpen: (run: ManufacturingRunRow) => void;
  reducedMotion: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: run.id, data: { run } });

  const style =
    transform && !reducedMotion
      ? {
          transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`,
        }
      : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <button
        type="button"
        className="w-full cursor-grab text-left active:cursor-grabbing"
        onClick={() => onOpen(run)}
      >
        <RunCardContent run={run} />
      </button>
    </div>
  );
}

function BoardColumn({
  stage,
  runs,
  onOpen,
  reducedMotion,
}: {
  stage: ManufacturingStage;
  runs: ManufacturingRunRow[];
  onOpen: (run: ManufacturingRunRow) => void;
  reducedMotion: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const totalQty = runs.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div className="flex min-w-[220px] flex-1 flex-col lg:min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium">{STAGE_LABELS[stage]}</h3>
          <Badge variant="secondary" className="num h-5 px-1.5">
            {runs.length}
          </Badge>
        </div>
        <span className="num text-[11px] text-muted-foreground">
          {totalQty.toLocaleString()} units
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[280px] flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-brand/50 bg-brand/5" : "border-border/70 bg-muted/20",
        )}
      >
        {runs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {STAGE_LABELS[stage]} —
          </div>
        ) : (
          runs.map((run) => (
            <DraggableRunCard
              key={run.id}
              run={run}
              onOpen={onOpen}
              reducedMotion={reducedMotion}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function ManufacturingBoard({
  runs: runsProp,
  onOpenRun,
}: {
  runs: ManufacturingRunRow[];
  onOpenRun: (run: ManufacturingRunRow) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [runs, setRuns] = React.useState(runsProp);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const activeRun = activeId
    ? runs.find((r) => r.id === activeId) ?? null
    : null;

  const runsByStage = React.useMemo(() => {
    const map = Object.fromEntries(
      MANUFACTURING_STAGES.map((s) => [s, [] as ManufacturingRunRow[]]),
    ) as Record<ManufacturingStage, ManufacturingRunRow[]>;
    for (const run of runs) {
      map[run.stage].push(run);
    }
    return map;
  }, [runs]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || pending) return;

    const runId = String(active.id);
    const newStage = over.id as ManufacturingStage;
    const run = runs.find((r) => r.id === runId);
    if (!run || run.stage === newStage) return;
    if (!MANUFACTURING_STAGES.includes(newStage)) return;

    const snapshot = runs;
    const optimistic = runs.map((r) =>
      r.id === runId ? applyStageSideEffects(r, newStage) : r,
    );
    setRuns(optimistic);

    startTransition(async () => {
      const result = await updateRunStage(runId, newStage);
      if (!result.ok) {
        setRuns(snapshot);
        toast.error(result.error.message);
      }
    });
  }

  return (
    <TooltipProvider delay={300}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 lg:mx-0 lg:overflow-visible">
          {MANUFACTURING_STAGES.map((stage) => (
            <BoardColumn
              key={stage}
              stage={stage}
              runs={runsByStage[stage]}
              onOpen={onOpenRun}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
        {!reducedMotion ? (
          <DragOverlay dropAnimation={null}>
            {activeRun ? (
              <div className="w-[220px] rotate-1 opacity-95">
                <RunCardContent run={activeRun} isDragging />
              </div>
            ) : null}
          </DragOverlay>
        ) : null}
      </DndContext>
    </TooltipProvider>
  );
}
