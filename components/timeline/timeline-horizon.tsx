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
import { ChevronLeft, ChevronRight, List } from "lucide-react";

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
const LANE_ROW_HEIGHT = 48;
const MILESTONE_MIN_WIDTH_PX = 160;
const LANE_LABEL_WIDTH = 132;

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
  className,
}: {
  events: TimelineEvent[];
  selectedEventId?: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
  className?: string;
}) {
  const [anchor, setAnchor] = React.useState(() => startOfMonth(new Date()));
  const [listOpen, setListOpen] = React.useState(false);
  const chartScrollRef = React.useRef<HTMLDivElement>(null);

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
    requestAnimationFrame(() => {
      const el = chartScrollRef.current;
      if (!el || !todayLeft) return;
      const pct = parseFloat(todayLeft) / 100;
      el.scrollLeft = Math.max(
        0,
        pct * el.scrollWidth - el.clientWidth / 2,
      );
    });
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center rounded-lg border border-dashed m-5">
        No events to plot. Manufacturing arrivals and PO expected dates will
        appear here once entered.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-h-0 bg-background",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
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
          <span className="text-sm font-medium tabular-nums px-1">
            {formatMonthLabel(anchor)} —{" "}
            {formatMonthLabel(addMonths(anchor, HORIZON_MONTHS - 1))}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={jumpToToday}>
            Today
          </Button>
        </div>
        <Button
          type="button"
          variant={listOpen ? "secondary" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setListOpen((o) => !o)}
        >
          <List className="size-3.5" />
          {windowEvents.length} in window
        </Button>
      </div>

      <div
        ref={chartScrollRef}
        className="flex-1 min-h-0 overflow-auto overscroll-contain"
      >
        <div
          className="min-h-full min-w-[min(100%,900px)]"
          style={{ minWidth: `max(100%, ${LANE_LABEL_WIDTH + HORIZON_MONTHS * 140}px)` }}
        >
          <div
            className="sticky top-0 z-20 grid border-b bg-muted/80 backdrop-blur"
            style={{
              gridTemplateColumns: `${LANE_LABEL_WIDTH}px 1fr`,
            }}
          >
            <div className="px-3 py-2.5 text-[11px] font-medium text-muted-foreground border-r">
              Lane
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${HORIZON_MONTHS}, minmax(140px, 1fr))`,
              }}
            >
              {monthTicks.map((m) => (
                <div
                  key={m.toISOString()}
                  className={cn(
                    "border-l px-3 py-2.5 text-xs font-semibold first:border-l-0",
                    isToday(m) && "text-brand",
                  )}
                >
                  {format(m, "MMMM")}
                </div>
              ))}
            </div>
          </div>

          {lanesWithData.length === 0 ? (
            <p className="p-12 text-sm text-muted-foreground text-center">
              No events in this window. Use Today or the arrows to find your
              events.
            </p>
          ) : (
            lanesWithData.map((category) => {
              const lane = laneEvents(events, category, anchor, horizonEnd);
              const colors = CATEGORY_COLORS[category];
              const laneHeight = Math.max(
                72,
                lane.length * LANE_ROW_HEIGHT + 24,
              );

              return (
                <div
                  key={category}
                  className="grid border-b last:border-b-0"
                  style={{
                    gridTemplateColumns: `${LANE_LABEL_WIDTH}px 1fr`,
                    minHeight: laneHeight,
                  }}
                >
                  <div className="sticky left-0 z-10 px-3 py-4 text-[13px] font-medium leading-snug border-r bg-background/95 backdrop-blur-sm">
                    {CATEGORY_LABELS[category]}
                    <span className="block text-[11px] font-normal text-muted-foreground mt-1">
                      {lane.length} item{lane.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="relative py-3 px-2">
                    <div
                      className="absolute inset-0 grid pointer-events-none"
                      style={{
                        gridTemplateColumns: `repeat(${HORIZON_MONTHS}, minmax(140px, 1fr))`,
                      }}
                    >
                      {monthTicks.map((m) => (
                        <div
                          key={m.toISOString()}
                          className="border-l border-dashed border-border/50 first:border-l-0"
                        />
                      ))}
                    </div>
                    {todayLeft ? (
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 z-[1] w-0.5 bg-brand"
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

                        const variantSubtitle = event.meta?.find(
                          (m) => m.label === "Variant",
                        )?.value;
                        const subText =
                          variantSubtitle ?? event.accent ?? event.label;
                        const tooltip = `${event.title}${
                          subText ? ` — ${subText}` : ""
                        } · ${formatEventDateRange(event)}`;

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
                                "absolute z-[2] flex h-10 items-center overflow-hidden rounded-lg border border-black/5 px-2.5 text-left shadow-sm transition-all",
                                colors.bar,
                                "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected &&
                                  "ring-2 ring-brand z-[3] brightness-95",
                                event.urgency === "overdue" &&
                                  "ring-2 ring-destructive/50",
                              )}
                              style={{ ...style, top }}
                              title={tooltip}
                              aria-label={tooltip}
                              aria-pressed={selected}
                            >
                              <span className="min-w-0 truncate text-xs font-semibold">
                                {event.title}
                              </span>
                              {subText ? (
                                <span className="ml-1.5 truncate text-[10px] font-medium opacity-75">
                                  · {subText}
                                </span>
                              ) : null}
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
                              "absolute z-[2] flex h-10 -translate-x-1/2 items-center overflow-hidden rounded-lg border border-black/5 px-2.5 text-left shadow-sm transition-all",
                              colors.bar,
                              "hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected &&
                                "ring-2 ring-brand z-[3] brightness-95",
                              event.urgency === "overdue" &&
                                "ring-2 ring-destructive/50",
                            )}
                            style={{
                              left,
                              top,
                              width: MILESTONE_MIN_WIDTH_PX,
                              maxWidth: "min(280px, 36%)",
                            }}
                            title={tooltip}
                            aria-label={tooltip}
                            aria-pressed={selected}
                          >
                            <span className="min-w-0 truncate text-xs font-semibold">
                              {event.title}
                            </span>
                            {subText ? (
                              <span className="ml-1.5 truncate text-[10px] font-medium opacity-75">
                                · {subText}
                              </span>
                            ) : null}
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

      {listOpen ? (
        <div className="shrink-0 border-t bg-card/80 max-h-[min(32vh,280px)] flex flex-col">
          <div className="px-4 py-2 border-b bg-muted/30">
            <p className="text-[12px] text-muted-foreground">
              Click an event for details · milestones are fixed markers, ranges
              span start → end
            </p>
          </div>
          <div className="overflow-y-auto p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {windowEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-full py-4 text-center">
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
        </div>
      ) : null}
    </div>
  );
}
