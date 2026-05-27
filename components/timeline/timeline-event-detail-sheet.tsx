"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarRange,
  Clock,
} from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";

import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CATEGORY_LABELS, type TimelineEvent } from "@/lib/timeline/types";
import {
  CATEGORY_COLORS,
  formatFullDate,
  humanizeStatus,
} from "@/lib/timeline/utils";
import { todayIso } from "@/lib/timeline/urgency";
import { cn } from "@/lib/utils";

const SOURCE_LINK_LABEL: Partial<Record<TimelineEvent["category"], string>> = {
  manufacturing: "Open in Manufacturing",
  purchase_order: "Open in Purchase Orders",
  payment: "Open in Purchase Orders",
  campaign: "Open in Campaigns",
  campaign_task: "Open in Campaigns",
};

function relativeDateLabel(iso: string): string {
  const diff = differenceInCalendarDays(parseISO(iso), parseISO(todayIso()));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export function TimelineEventDetailSheet({
  event,
  open,
  onOpenChange,
}: {
  event: TimelineEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const colors = event ? CATEGORY_COLORS[event.category] : null;
  const isRange = event?.kind === "range" && event.endDate;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {event ? (
          <>
            <SheetHeader className="text-left border-b pb-4">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-0.5 text-[11px] font-medium",
                    colors?.text,
                  )}
                >
                  <span
                    className={cn("size-1.5 rounded-full", colors?.dot)}
                    aria-hidden
                  />
                  {CATEGORY_LABELS[event.category]}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {event.label}
                </span>
              </div>
              <SheetTitle className="text-lg leading-snug pr-6">
                {event.title}
              </SheetTitle>
              {event.accent ? (
                <SheetDescription className="text-sm font-medium text-foreground/80">
                  {event.accent}
                </SheetDescription>
              ) : null}
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto py-5 px-1 -mx-1">
              {event.urgency === "overdue" ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <p>
                    This date has passed. Update the expected date or complete
                    the related work in the source module.
                  </p>
                </div>
              ) : event.urgency === "soon" ? (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning-foreground">
                  <Clock className="size-4 shrink-0 mt-0.5" />
                  <p>Coming up within the next week.</p>
                </div>
              ) : null}

              <section className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {isRange ? "Window" : "When"}
                </p>
                <div className="rounded-lg border bg-card/50 p-3 space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    {isRange ? (
                      <CalendarRange className="size-4 text-muted-foreground self-center" />
                    ) : null}
                    <p className="font-medium tabular-nums">
                      {formatFullDate(event.date)}
                    </p>
                  </div>
                  {isRange ? (
                    <div className="flex items-baseline gap-2">
                      <span className="text-muted-foreground/70 text-xs pl-1">→</span>
                      <p className="font-medium tabular-nums">
                        {formatFullDate(event.endDate!)}
                      </p>
                    </div>
                  ) : null}
                  <p className="text-[12px] text-muted-foreground tabular-nums pt-0.5">
                    {relativeDateLabel(event.date)}
                  </p>
                </div>
              </section>

              {event.meta && event.meta.length > 0 ? (
                <section className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Details
                  </p>
                  <dl className="rounded-lg border bg-card/50 divide-y">
                    {event.meta.map((m) => (
                      <div
                        key={m.label}
                        className="flex items-baseline gap-3 px-3 py-2 text-sm"
                      >
                        <dt className="w-24 shrink-0 text-[12px] text-muted-foreground">
                          {m.label}
                        </dt>
                        <dd className="min-w-0 flex-1 font-medium">
                          {m.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : event.subtitle ? (
                <section className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Details
                  </p>
                  <p className="rounded-lg border bg-card/50 px-3 py-2 text-sm text-muted-foreground">
                    {event.subtitle}
                  </p>
                </section>
              ) : null}

              {event.status &&
              !event.meta?.some((m) => m.label.toLowerCase() === "status") ? (
                <section className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <p className="text-sm font-medium">
                    {humanizeStatus(event.status)}
                  </p>
                </section>
              ) : null}
            </div>

            {event.href ? (
              <div className="border-t pt-4">
                <Link
                  href={event.href}
                  onClick={() => onOpenChange(false)}
                  className={buttonVariants({
                    className: "w-full gap-1.5",
                  })}
                >
                  {SOURCE_LINK_LABEL[event.category] ?? "Open source"}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
