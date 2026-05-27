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

  const detailItems = event.meta?.slice(0, 2) ?? [];

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
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", colors.dot)}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-tight line-clamp-2">
              {event.title}
            </p>
            {event.accent ? (
              <p className="mt-1 text-[12px] font-medium text-foreground/80 tabular-nums">
                {event.accent}
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

        {detailItems.length > 0 ? (
          <dl className="text-[11px] text-muted-foreground space-y-0.5">
            {detailItems.map((m) => (
              <div key={m.label} className="flex gap-1.5">
                <dt className="text-muted-foreground/70 shrink-0">{m.label}:</dt>
                <dd className="font-medium text-foreground/80 truncate">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : event.subtitle ? (
          <p className="line-clamp-2 text-[12px] text-muted-foreground">
            {event.subtitle}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-0.5">
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
