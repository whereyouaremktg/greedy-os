import { differenceInCalendarDays, parseISO } from "date-fns";

import type { ManufacturingStage } from "@/lib/manufacturing/stages";

export type ArrivalPillVariant = "overdue" | "soon" | "neutral";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getArrivalPillVariant(
  expectedArrival: string | null,
  stage: ManufacturingStage,
): ArrivalPillVariant {
  if (!expectedArrival || stage === "received") return "neutral";
  const diff = differenceInCalendarDays(
    parseISO(expectedArrival),
    parseISO(todayIso()),
  );
  if (diff < 0) return "overdue";
  if (diff <= 7) return "soon";
  return "neutral";
}

export function formatArrivalLabel(expectedArrival: string | null): string {
  if (!expectedArrival) return "—";
  const diff = differenceInCalendarDays(
    parseISO(expectedArrival),
    parseISO(todayIso()),
  );
  if (diff < 0) return expectedArrival;
  if (diff === 0) return "Today";
  return expectedArrival;
}

export function formatDaysToBadge(expectedArrival: string | null): string {
  if (!expectedArrival) return "—";
  const diff = differenceInCalendarDays(
    parseISO(expectedArrival),
    parseISO(todayIso()),
  );
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  return `${diff}d`;
}
