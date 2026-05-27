"use client";

import Link from "next/link";
import { AlertCircle, CalendarRange } from "lucide-react";

import { CATEGORY_COLORS } from "@/lib/timeline/utils";
import { CATEGORY_LABELS, type TimelineEvent } from "@/lib/timeline/types";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/timeline/utils";

export function TimelineEventRow({
  event,
  showCategory = true,
}: {
  event: TimelineEvent;
  showCategory?: boolean;
}) {
  const colors = CATEGORY_COLORS[event.category];
  const dateLabel =
    event.kind === "range" && event.endDate
      ? `${formatShortDate(event.date)} → ${formatShortDate(event.endDate)}`
      : formatShortDate(event.date);

  const inner = (
    <div
      className={cn(
        "flex gap-3 rounded-lg border bg-card p-3 transition-colors",
        event.href && "hover:border-brand/40",
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
              <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                {event.subtitle}
              </p>
            ) : null}
          </div>
          {event.urgency === "overdue" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              <AlertCircle className="size-3" />
              Overdue
            </span>
          ) : event.urgency === "soon" ? (
            <span className="inline-flex rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
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
    </div>
  );

  if (event.href) {
    return (
      <Link href={event.href} className="block outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {inner}
      </Link>
    );
  }

  return inner;
}
