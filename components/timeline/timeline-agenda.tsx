"use client";

import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  parseISO,
  startOfDay,
} from "date-fns";

import { TimelineEventRow } from "@/components/timeline/timeline-event-row";
import { todayIso } from "@/lib/timeline/urgency";
import { formatDayKey } from "@/lib/timeline/utils";
import type { TimelineEvent } from "@/lib/timeline/types";

function groupByDay(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) {
    const key = e.date;
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

export function TimelineAgenda({
  events,
  daysAhead = 120,
  selectedEventId,
  onSelectEvent,
}: {
  events: TimelineEvent[];
  daysAhead?: number;
  selectedEventId?: string | null;
  onSelectEvent: (event: TimelineEvent) => void;
}) {
  const today = startOfDay(parseISO(todayIso()));
  const horizonEnd = addDays(today, daysAhead);

  const upcoming = events.filter((e) => {
    const d = parseISO(e.date);
    const end = e.endDate ? parseISO(e.endDate) : d;
    return !isBefore(end, today) && !isBefore(horizonEnd, d);
  });

  const overdue = events.filter((e) => {
    if (e.urgency !== "overdue") return false;
    const d = parseISO(e.date);
    return isBefore(d, today) && e.status !== "paid" && e.status !== "done";
  });

  const grouped = groupByDay(
    upcoming.filter((e) => e.urgency !== "overdue" || e.status === "paid"),
  );

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center rounded-lg border border-dashed">
        No dated events yet. Add expected dates on manufacturing runs, purchase
        orders, or campaigns to populate this view.
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {overdue.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-destructive">
            Needs attention ({overdue.length})
          </h3>
          <div className="space-y-2">
            {overdue.map((e) => (
              <TimelineEventRow
                key={e.id}
                event={e}
                onSelect={onSelectEvent}
                selected={selectedEventId === e.id}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-[13px] font-semibold text-muted-foreground">
          Upcoming
        </h3>
        {[...grouped.entries()].length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming milestones in the next {daysAhead} days.
          </p>
        ) : (
          [...grouped.entries()].map(([iso, dayEvents]) => {
            const diff = differenceInCalendarDays(parseISO(iso), today);
            const relative =
              diff === 0
                ? "Today"
                : diff === 1
                  ? "Tomorrow"
                  : diff < 7
                    ? `In ${diff} days`
                    : null;

            return (
              <div key={iso} className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-[13px] font-medium">{formatDayKey(iso)}</h4>
                  {relative ? (
                    <span className="text-[11px] text-muted-foreground">
                      {relative}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {format(parseISO(iso), "yyyy")}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {dayEvents.map((e) => (
                    <TimelineEventRow
                      key={e.id}
                      event={e}
                      onSelect={onSelectEvent}
                      selected={selectedEventId === e.id}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
