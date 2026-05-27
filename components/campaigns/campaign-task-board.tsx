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
import { toast } from "sonner";

import type { BoardTaskRow } from "@/components/campaigns/types";
import { usePrefersReducedMotion } from "@/components/relative-time";
import { updateTaskStatus } from "@/lib/actions/campaigns";
import {
  CAMPAIGN_TASK_STATUSES,
  CAMPAIGN_TASK_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type CampaignTaskStatus,
} from "@/lib/campaigns/types";
import {
  formatArrivalDisplay,
  formatDaysToBadge,
  getArrivalPillVariant,
} from "@/lib/manufacturing/dates";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function TaskCardContent({
  task,
  isDragging = false,
}: {
  task: BoardTaskRow;
  isDragging?: boolean;
}) {
  const variant = getArrivalPillVariant(task.due_date, "ordered");
  const hasDue = !!task.due_date;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs transition-shadow",
        isDragging && "shadow-md ring-2 ring-brand/20",
      )}
    >
      <p className="text-sm font-medium leading-snug">{task.title}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {task.campaign_name}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {CAMPAIGN_TYPE_LABELS[task.campaign_type]}
        </Badge>
        {task.owner ? (
          <span className="text-[11px] text-muted-foreground">{task.owner}</span>
        ) : null}
      </div>
      {hasDue ? (
        <div
          className={cn(
            "mt-2.5 flex items-center justify-between gap-2 rounded-md border px-2.5 py-2",
            variant === "overdue" && "border-destructive/35 bg-destructive/8",
            variant === "soon" && "border-warning/45 bg-warning/12",
            variant === "neutral" && "border-brand/25 bg-brand/8",
          )}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Due
            </p>
            <p
              className={cn(
                "num mt-0.5 truncate text-sm font-semibold tabular-nums leading-tight",
                variant === "overdue" && "text-destructive",
              )}
            >
              {formatArrivalDisplay(task.due_date)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              variant === "overdue" &&
                "bg-destructive/15 text-destructive dark:bg-destructive/25",
              variant === "soon" &&
                "bg-warning/20 text-warning-foreground dark:text-warning",
              variant === "neutral" &&
                "bg-background/80 text-muted-foreground ring-1 ring-border/60",
            )}
          >
            {formatDaysToBadge(task.due_date)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function DraggableTaskCard({
  task,
  onOpen,
  reducedMotion,
}: {
  task: BoardTaskRow;
  onOpen: (task: BoardTaskRow) => void;
  reducedMotion: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });

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
        onClick={() => onOpen(task)}
      >
        <TaskCardContent task={task} />
      </button>
    </div>
  );
}

function BoardColumn({
  status,
  tasks,
  onOpen,
  reducedMotion,
}: {
  status: CampaignTaskStatus;
  tasks: BoardTaskRow[];
  onOpen: (task: BoardTaskRow) => void;
  reducedMotion: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex min-w-[220px] flex-1 flex-col lg:min-w-0">
      <div className="mb-2 flex items-center gap-2 px-0.5">
        <h3 className="text-[13px] font-medium">
          {CAMPAIGN_TASK_STATUS_LABELS[status]}
        </h3>
        <Badge variant="secondary" className="num h-5 px-1.5">
          {tasks.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[280px] flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver ? "border-brand/50 bg-brand/5" : "border-border/70 bg-muted/20",
        )}
      >
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {CAMPAIGN_TASK_STATUS_LABELS[status]} —
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              task={task}
              onOpen={onOpen}
              reducedMotion={reducedMotion}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function CampaignTaskBoard({
  tasks: tasksProp,
  onOpenTask,
}: {
  tasks: BoardTaskRow[];
  onOpenTask: (task: BoardTaskRow) => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [tasks, setTasks] = React.useState(tasksProp);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setTasks(tasksProp);
  }, [tasksProp]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId) ?? null
    : null;

  const openTasks = tasks.filter(
    (t) => t.campaign_status !== "archived" && t.campaign_status !== "complete",
  );

  const tasksByStatus = React.useMemo(() => {
    const map = Object.fromEntries(
      CAMPAIGN_TASK_STATUSES.map((s) => [s, [] as BoardTaskRow[]]),
    ) as Record<CampaignTaskStatus, BoardTaskRow[]>;
    for (const task of openTasks) {
      map[task.status].push(task);
    }
    return map;
  }, [openTasks]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || pending) return;

    const taskId = String(active.id);
    const newStatus = over.id as CampaignTaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    if (!CAMPAIGN_TASK_STATUSES.includes(newStatus)) return;

    const snapshot = tasks;
    const optimistic = tasks.map((t) =>
      t.id === taskId ? { ...t, status: newStatus } : t,
    );
    setTasks(optimistic);

    startTransition(async () => {
      const result = await updateTaskStatus(taskId, newStatus);
      if (!result.ok) {
        setTasks(snapshot);
        toast.error(result.error);
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 lg:mx-0 lg:overflow-visible">
        {CAMPAIGN_TASK_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onOpen={onOpenTask}
            reducedMotion={reducedMotion}
          />
        ))}
      </div>
      {!reducedMotion ? (
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-[220px] rotate-1 opacity-95">
              <TaskCardContent task={activeTask} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      ) : null}
    </DndContext>
  );
}
