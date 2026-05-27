"use client";

import * as React from "react";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  isToday,
  max,
  min,
  parseISO,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { TimelineEventRow } from "@/components/timeline/timeline-event-row";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type TimelineCategory,
  type TimelineEvent,
} from "@/lib/timeline/types";
import {
  CATEGORY_COLORS,
  formatEventDateRange,
  formatMonthLabel,
  isInHorizon,
  shiftMonth,
  sortEventsByDate,
} from "@/lib/timeline/utils";
import { todayIso } from "@/lib/timeline/urgency";
import { cn } from "@/lib/utils";

const HORIZON_MONTHS = 6;
const LANE_ROW_HEIGHT = 40;
const MILESTONE_MIN_WIDTH_PX = 128;

function laneEvents(
  events: TimelineEvent[],
  category: TimelineCategory,
  horizonStart: Date,
  horizonEnd: Date,
): TimelineEvent[] {
  return sortEventsByDate(
    events.filter(
      (e) =>
        e.category === category && isInHorizon(e, horizonStart, horizonEnd),
    ),
  );
}

function eventsInWindow(
  events: TimelineEvent[],
  horizonStart: Date,
  horizonEnd: Date,
): TimelineEvent[] {
  return sortEventsByDate(
    events.filter((e) => isInHorizon(e, horizonStart, horizonEnd)),
  );
}

function rangeBarStyle(
  event: TimelineEvent,
  horizonStart: Date,
  horizonEnd: Date,
  totalDays: number,
): { left: string; width: string } {
  const start = parseISO(event.date);
  const end = event.endDate ? parseISO(event.endDate) : start;
  const clampedStart = max([start, horizonStart]);
  const clampedEnd = min([end, horizonEnd]);
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

function milestoneMarkerLeft(
  event: TimelineEvent,
  horizonStart: Date,
  totalDays: number,
): string {
  const start = parseISO(event.date);
  const offset = Math.max(0, differenceInCalendarDays(start, horizonStart));
  const leftPct = (offset / totalDays) * 100;
  return `${Math.min(100, leftPct)}%`;
}

function todayMarkerLeft(
  horizonStart: Date,
  horizonEnd: Date,
  totalDays: number,
): string | null {
  const today = parseISO(todayIso());
  if (today < horizonStart || today > horizonEnd) return null;
  const offset = differenceInCalendarDays(today, horizonStart);
  return `${(offset / totalDays) * 100}%`;
}

export function TimelineHorizon({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: TimelineEvent[];
  selectedEventId?: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
}) {
  const [anchor, setAnchor] = React.useState(() => startOfMonth(new Date()));
  const horizonEnd = addMonths(anchor, HORIZON_MONTHS);
  const totalDays = differenceInCalendarDays(horizonEnd, anchor);
  const monthTicks = Array.from({ length: HORIZON_MONTHS }, (_, i) =>
    addMonths(anchor, i),
  );
  const windowEvents = eventsInWindow(events, anchor, horizonEnd);
  const todayLeft = todayMarkerLeft(anchor, horizonEnd, totalDays);

  const lanesWithData = CATEGORY_ORDER.filter((cat) =>
    laneEvents(events, cat, anchor, horizonEnd).length > 0,
  );

  function jumpToToday() {
    setAnchor(startOfMonth(new Date()));
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center rounded-lg border border-dashed">
        No events to plot. Manufacturing arrivals and PO expected dates will
        appear here once entered.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setAnchor((m) => shiftMonth(m, -HORIZON_MONTHS))}
            aria-label="Earlier period"
          >
            <ChevronLeft className="size-4" />
          </Button>
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
        <p className="text-sm font-medium tabular-nums">
          {formatMonthLabel(anchor)} —{" "}
          {formatMonthLabel(addMonths(anchor, HORIZON_MONTHS - 1))}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={jumpToToday}>
          Today
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-lg border min-w-0">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[minmax(100px,120px)_1fr] border-b bg-muted/40">
              <div className="px-3 py-2 text-[11px] font-medium text-muted-foreground">
                Lane
              </div>
              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `repeat(${HORIZON_MONTHS}, 1fr)`,
                }}
              >
                {monthTicks.map((m) => (
                  <div
                    key={m.toISOString()}
                    className={cn(
                      "border-l px-2 py-2 text-[11px] font-medium first:border-l-0",
                      isToday(m) && "text-brand",
                    )}
                  >
                    {format(m, "MMM")}
                  </div>
                ))}
              </div>
            </div>

            {lanesWithData.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No events in this window. Use Today or the arrows to find your
                events.
              </p>
            ) : (
              lanesWithData.map((category) => {
                const lane = laneEvents(events, category, anchor, horizonEnd);
                const colors = CATEGORY_COLORS[category];
                const laneHeight = lane.length * LANE_ROW_HEIGHT + 16;

                return (
                  <div
                    key={category}
                    className="grid grid-cols-[minmax(100px,120px)_1fr] border-b last:border-b-0"
                    style={{ minHeight: laneHeight }}
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
                        style={{
                          gridTemplateColumns: `repeat(${HORIZON_MONTHS}, 1fr)`,
                        }}
                      >
                        {monthTicks.map((m) => (
                          <div
                            key={m.toISOString()}
                            className="border-l border-dashed border-border/60 first:border-l-0"
                          />
                        ))}
                      </div>
                      {todayLeft ? (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-brand/70"
                          style={{ left: todayLeft }}
                          aria-hidden
                        />
                      ) : null}
                      <div
                        className="relative mx-1"
                        style={{ height: lane.length * LANE_ROW_HEIGHT }}
                      >
                        {lane.map((event, rowIndex) => {
                          const selected = selectedEventId === event.id;
                          const top = rowIndex * LANE_ROW_HEIGHT;

                          if (event.kind === "range" && event.endDate) {
                            const style = rangeBarStyle(
                              event,
                              anchor,
                              horizonEnd,
                              totalDays,
                            );
                            return (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => onSelectEvent(event)}
                                className={cn(
                                  "absolute z-[2] h-8 rounded-md border border-black/5 px-2 flex items-center overflow-hidden text-left shadow-xs transition-all",
                                  colors.bar,
                                  "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selected &&
                                    "ring-2 ring-brand z-[3] brightness-95",
                                  event.urgency === "overdue" &&
                                    "ring-1 ring-destructive/60",
                                )}
                                style={{ ...style, top }}
                                aria-label={`${event.title}, ${formatEventDateRange(event)}`}
                              >
                                <span className="truncate text-[11px] font-medium">
                                  {event.title}
                                </span>
                              </button>
                            );
                          }

                          const left = milestoneMarkerLeft(
                            event,
                            anchor,
                            totalDays,
                          );
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => onSelectEvent(event)}
                              className={cn(
                                "absolute z-[2] h-8 -translate-x-1/2 rounded-md border border-black/5 px-2 flex items-center justify-center overflow-hidden text-left shadow-xs transition-all",
                                colors.bar,
                                "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected &&
                                  "ring-2 ring-brand z-[3] brightness-95",
                                event.urgency === "overdue" &&
                                  "ring-1 ring-destructive/60",
                              )}
                              style={{
                                left,
                                top,
                                width: MILESTONE_MIN_WIDTH_PX,
                                maxWidth: "42%",
                              }}
                              aria-label={`${event.title}, ${formatEventDateRange(event)}`}
                            >
                              <span className="truncate text-[11px] font-medium w-full text-center">
                                {event.title}
                              </span>
                            </button>
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

        <aside className="rounded-lg border bg-card/50 min-h-[200px] flex flex-col">
          <div className="border-b px-3 py-2.5">
            <h3 className="text-[13px] font-semibold">In this window</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {windowEvents.length} event
              {windowEvents.length === 1 ? "" : "s"} · click for details
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[420px]">
            {windowEvents.length === 0 ? (
              <p className="text-[12px] text-muted-foreground px-1 py-4 text-center">
                Shift the horizon to find events.
              </p>
            ) : (
              windowEvents.map((event) => (
                <TimelineEventRow
                  key={event.id}
                  event={event}
                  onSelect={onSelectEvent}
                  selected={selectedEventId === event.id}
                  showCategory
                />
              ))
            )}
          </div>
        </aside>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Click any bar or list item for full details. Milestones use fixed-width
        markers; campaign windows span their date range.
      </p>
    </div>
  );
}
