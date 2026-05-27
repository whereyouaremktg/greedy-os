"use client";

import * as React from "react";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  max,
  min,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type TimelineCategory,
  type TimelineEvent,
} from "@/lib/timeline/types";
import {
  CATEGORY_COLORS,
  formatMonthLabel,
  formatShortDate,
  isInHorizon,
  shiftMonth,
} from "@/lib/timeline/utils";
import { cn } from "@/lib/utils";

const HORIZON_MONTHS = 6;

function laneEvents(
  events: TimelineEvent[],
  category: TimelineCategory,
  horizonStart: Date,
  horizonEnd: Date,
): TimelineEvent[] {
  return events.filter(
    (e) =>
      e.category === category && isInHorizon(e, horizonStart, horizonEnd),
  );
}

function barStyle(
  event: TimelineEvent,
  horizonStart: Date,
  totalDays: number,
): { left: string; width: string } {
  const start = parseISO(event.date);
  const end = event.endDate ? parseISO(event.endDate) : start;
  const clampedStart = max([start, horizonStart]);
  const clampedEnd = min([end, addMonths(horizonStart, HORIZON_MONTHS)]);
  const startOffset = differenceInCalendarDays(clampedStart, horizonStart);
  const duration = Math.max(
    1,
    differenceInCalendarDays(clampedEnd, clampedStart) + 1,
  );
  const leftPct = (startOffset / totalDays) * 100;
  const widthPct = (duration / totalDays) * 100;
  return {
    left: `${leftPct}%`,
    width: `${Math.min(widthPct, 100 - leftPct)}%`,
  };
}

export function TimelineHorizon({ events }: { events: TimelineEvent[] }) {
  const [anchor, setAnchor] = React.useState(() => startOfMonth(new Date()));
  const horizonEnd = addMonths(anchor, HORIZON_MONTHS);
  const totalDays = differenceInCalendarDays(horizonEnd, anchor);
  const monthTicks = Array.from({ length: HORIZON_MONTHS }, (_, i) =>
    addMonths(anchor, i),
  );

  const lanesWithData = CATEGORY_ORDER.filter((cat) =>
    laneEvents(events, cat, anchor, horizonEnd).length > 0,
  );

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center rounded-lg border border-dashed">
        No events to plot. Manufacturing arrivals and PO expected dates will
        appear here once entered.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setAnchor((m) => shiftMonth(m, -HORIZON_MONTHS))}
          aria-label="Earlier period"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <p className="text-sm font-medium tabular-nums">
          {formatMonthLabel(anchor)} — {formatMonthLabel(addMonths(anchor, HORIZON_MONTHS - 1))}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setAnchor((m) => shiftMonth(m, HORIZON_MONTHS))}
          aria-label="Later period"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[140px_1fr] border-b bg-muted/40">
            <div className="px-3 py-2 text-[11px] font-medium text-muted-foreground">
              Lane
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${HORIZON_MONTHS}, 1fr)` }}>
              {monthTicks.map((m) => (
                <div
                  key={m.toISOString()}
                  className="border-l px-2 py-2 text-[11px] font-medium text-muted-foreground first:border-l-0"
                >
                  {format(m, "MMM")}
                </div>
              ))}
            </div>
          </div>

          {lanesWithData.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              No events in this {HORIZON_MONTHS}-month window. Try shifting the
              horizon.
            </p>
          ) : (
            lanesWithData.map((category) => {
              const lane = laneEvents(events, category, anchor, horizonEnd);
              const colors = CATEGORY_COLORS[category];

              return (
                <div
                  key={category}
                  className="grid grid-cols-[140px_1fr] border-b last:border-b-0 min-h-[56px]"
                >
                  <div className="px-3 py-3 text-[12px] font-medium leading-tight border-r bg-muted/20">
                    {CATEGORY_LABELS[category]}
                    <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                      {lane.length} item{lane.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="relative py-2 px-1">
                    <div
                      className="absolute inset-0 grid pointer-events-none"
                      style={{ gridTemplateColumns: `repeat(${HORIZON_MONTHS}, 1fr)` }}
                    >
                      {monthTicks.map((m) => (
                        <div
                          key={m.toISOString()}
                          className="border-l border-dashed border-border/60 first:border-l-0"
                        />
                      ))}
                    </div>
                    <div className="relative h-10 mx-1">
                      {lane.map((event) => {
                        const style = barStyle(event, anchor, totalDays);
                        return (
                          <div
                            key={event.id}
                            className="absolute top-1/2 -translate-y-1/2 h-7 min-w-[4px] group"
                            style={style}
                            title={`${event.title} — ${event.label}`}
                          >
                            <div
                              className={cn(
                                "h-full rounded-md px-1.5 flex items-center overflow-hidden shadow-xs border border-black/5",
                                colors.bar,
                                event.urgency === "overdue" &&
                                  "ring-1 ring-destructive/50",
                              )}
                            >
                              <span className="truncate text-[10px] font-medium text-foreground/90">
                                {event.title}
                              </span>
                            </div>
                            <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden group-hover:block min-w-[180px] rounded-md border bg-popover p-2 text-[11px] shadow-md">
                              <p className="font-medium">{event.title}</p>
                              <p className="text-muted-foreground mt-0.5">
                                {event.label}
                              </p>
                              <p className="text-muted-foreground mt-0.5 tabular-nums">
                                {event.kind === "range" && event.endDate
                                  ? `${formatShortDate(event.date)} → ${formatShortDate(event.endDate)}`
                                  : formatShortDate(event.date)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Hover bars for details. Campaign windows span start → end; milestones are
        single-day markers.
      </p>
    </div>
  );
}
