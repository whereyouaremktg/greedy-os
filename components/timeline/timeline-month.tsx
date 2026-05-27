"use client";

import * as React from "react";
import { format, isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { TimelineEventRow } from "@/components/timeline/timeline-event-row";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_COLORS,
  eventsOnDate,
  formatMonthLabel,
  isCurrentMonth,
  monthGrid,
  shiftMonth,
} from "@/lib/timeline/utils";
import type { TimelineEvent } from "@/lib/timeline/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TimelineMonth({
  events,
}: {
  events: TimelineEvent[];
}) {
  const [month, setMonth] = React.useState(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);
  const days = monthGrid(month);

  const selectedEvents = selectedDay
    ? eventsOnDate(events, selectedDay)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-semibold tabular-nums">
          {formatMonthLabel(month)}
        </h2>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-1 py-2 text-center text-[11px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayEvents = eventsOnDate(events, day);
            const inMonth = isCurrentMonth(day, month);
            const selected = selectedDay && isSameDay(day, selectedDay);
            const hasOverdue = dayEvents.some((e) => e.urgency === "overdue");
            const hasSoon = dayEvents.some((e) => e.urgency === "soon");

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "min-h-[72px] border-b border-r p-1.5 text-left transition-colors last:border-r-0",
                  "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  !inMonth && "bg-muted/20 text-muted-foreground/60",
                  selected && "bg-brand/10 ring-1 ring-inset ring-brand/30",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums",
                    isToday(day) &&
                      "bg-brand text-brand-foreground font-semibold",
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayEvents.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {[...new Set(dayEvents.map((e) => e.category))]
                      .slice(0, 4)
                      .map((cat) => (
                        <span
                          key={cat}
                          className={cn(
                            "size-1.5 rounded-full",
                            CATEGORY_COLORS[cat].dot,
                            hasOverdue && cat === dayEvents.find((e) => e.urgency === "overdue")?.category && "ring-1 ring-destructive",
                          )}
                        />
                      ))}
                    {dayEvents.length > 4 ? (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayEvents.length - 4}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {(hasOverdue || hasSoon) && inMonth ? (
                  <span
                    className={cn(
                      "mt-0.5 block h-0.5 w-full rounded-full",
                      hasOverdue ? "bg-destructive/60" : "bg-warning/60",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-muted-foreground">
          {selectedDay
            ? format(selectedDay, "EEEE, MMMM d, yyyy")
            : "Select a day to see events"}
        </h3>
        {selectedDay && selectedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center rounded-lg border border-dashed">
            No events on this day.
          </p>
        ) : null}
        {selectedEvents.map((e) => (
          <TimelineEventRow key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}
