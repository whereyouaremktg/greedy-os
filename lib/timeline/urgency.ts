import { differenceInCalendarDays, parseISO } from "date-fns";

export type TimelineUrgency = "overdue" | "soon" | "neutral";

export function urgencyForDate(
  date: string | null | undefined,
  opts?: { soonDays?: number; ignoreIfPastPaid?: boolean },
): TimelineUrgency {
  if (!date) return "neutral";
  const soonDays = opts?.soonDays ?? 7;
  const diff = differenceInCalendarDays(parseISO(date), parseISO(todayIso()));
  if (diff < 0) return "overdue";
  if (diff <= soonDays) return "soon";
  return "neutral";
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
