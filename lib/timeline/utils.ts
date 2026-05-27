import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { TimelineCategory, TimelineEvent } from "@/lib/timeline/types";

export function filterEvents(
  events: TimelineEvent[],
  category: TimelineCategory | "all",
  opts?: { hidePaid?: boolean },
): TimelineEvent[] {
  let filtered = events;
  if (category !== "all") {
    filtered = filtered.filter((e) => e.category === category);
  }
  if (opts?.hidePaid) {
    filtered = filtered.filter(
      (e) => !(e.category === "payment" && e.status === "paid"),
    );
  }
  return filtered;
}

export function eventsOnDate(
  events: TimelineEvent[],
  day: Date,
): TimelineEvent[] {
  return events.filter((e) => {
    const start = parseISO(e.date);
    if (isSameDay(start, day)) return true;
    if (e.kind === "range" && e.endDate) {
      const end = parseISO(e.endDate);
      return day >= start && day <= end;
    }
    return false;
  });
}

export function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 0 }), 6);
  return eachDayOfInterval({ start, end });
}

export function formatMonthLabel(month: Date): string {
  return format(month, "MMMM yyyy");
}

export function formatShortDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

export function formatDayKey(iso: string): string {
  return format(parseISO(iso), "EEE, MMM d");
}

export function formatEventDateRange(event: {
  date: string;
  endDate?: string | null;
  kind: "milestone" | "range";
}): string {
  if (event.kind === "range" && event.endDate) {
    return `${formatShortDate(event.date)} → ${formatShortDate(event.endDate)}`;
  }
  return formatShortDate(event.date);
}

export function sortEventsByDate(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

export const CATEGORY_COLORS: Record<
  TimelineCategory,
  { bar: string; dot: string; text: string }
> = {
  manufacturing: {
    bar: "bg-chart-1/80",
    dot: "bg-chart-1",
    text: "text-chart-1",
  },
  purchase_order: {
    bar: "bg-chart-2/80",
    dot: "bg-chart-2",
    text: "text-chart-2",
  },
  payment: {
    bar: "bg-warning/70",
    dot: "bg-warning",
    text: "text-warning",
  },
  campaign: {
    bar: "bg-chart-4/80",
    dot: "bg-chart-4",
    text: "text-chart-4",
  },
  campaign_task: {
    bar: "bg-chart-5/80",
    dot: "bg-chart-5",
    text: "text-chart-5",
  },
  deal: {
    bar: "bg-chart-3/80",
    dot: "bg-chart-3",
    text: "text-chart-3",
  },
};

export function shiftMonth(month: Date, delta: number): Date {
  return startOfMonth(addMonths(month, delta));
}

export function isInHorizon(
  event: TimelineEvent,
  horizonStart: Date,
  horizonEnd: Date,
): boolean {
  const start = parseISO(event.date);
  const end = event.endDate ? parseISO(event.endDate) : start;
  return end >= horizonStart && start <= horizonEnd;
}

export function isCurrentMonth(day: Date, month: Date): boolean {
  return isSameMonth(day, month);
}
