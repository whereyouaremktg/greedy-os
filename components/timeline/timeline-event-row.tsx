"use client";

import { AlertCircle, CalendarRange, ChevronRight } from "lucide-react";

import { CATEGORY_COLORS, formatEventDateRange } from "@/lib/timeline/utils";
import { CATEGORY_LABELS, type TimelineEvent } from "@/lib/timeline/types";
import { cn } from "@/lib/utils";

export function TimelineEventRow({
  event,
  onSelect,
  selected = false,
  showCategory = true,
}: {
  event: TimelineEvent;
  onSelect?: (event: TimelineEvent) => void;
  selected?: boolean;
  showCategory?: boolean;
}) {
  const colors = CATEGORY_COLORS[event.category];
  const dateLabel = formatEventDateRange(event);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(event)}
      className={cn(
        "flex w-full gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
        "hover:border-brand/40 hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-brand/50 bg-brand/5 ring-1 ring-brand/20",
      )}
    >
      <div
        className={cn("mt-1 size-2 shrink-0 rounded-full", colors.dot)}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-tight">{event.title}</p>
            {event.subtitle ? (
              <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                {event.subtitle}
              </p>
            ) : null}
          </div>
          {event.urgency === "overdue" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <AlertCircle className="size-3" />
              Overdue
            </span>
          ) : event.urgency === "soon" ? (
            <span className="inline-flex shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
              Soon
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            {event.kind === "range" ? (
              <CalendarRange className="size-3 shrink-0" />
            ) : null}
            {dateLabel}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>{event.label}</span>
          {showCategory ? (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className={cn("font-medium", colors.text)}>
                {CATEGORY_LABELS[event.category]}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <ChevronRight
        className="size-4 shrink-0 self-center text-muted-foreground/60"
        aria-hidden
      />
    </button>
  );
}
