"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, CalendarRange } from "lucide-react";

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
  formatEventDateRange,
} from "@/lib/timeline/utils";
import { cn } from "@/lib/utils";

const SOURCE_LINK_LABEL: Partial<Record<TimelineEvent["category"], string>> = {
  manufacturing: "Open manufacturing",
  purchase_order: "Open purchase orders",
  payment: "Open purchase orders",
  campaign: "Open campaigns",
  campaign_task: "Open campaigns",
};

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {event ? (
          <>
            <SheetHeader className="text-left border-b pb-4">
              <div className="flex items-start gap-2">
                <span
                  className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", colors?.dot)}
                  aria-hidden
                />
                <div className="min-w-0 space-y-1">
                  <SheetTitle className="text-base leading-snug pr-6">
                    {event.title}
                  </SheetTitle>
                  <SheetDescription className="text-[13px]">
                    {CATEGORY_LABELS[event.category]} · {event.label}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-5 py-5">
              {event.urgency === "overdue" ? (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <p>
                    This date has passed. Update the expected date or complete
                    the related work in the source module.
                  </p>
                </div>
              ) : event.urgency === "soon" ? (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning-foreground">
                  Coming up within the next week.
                </div>
              ) : null}

              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    When
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-medium tabular-nums">
                    {event.kind === "range" ? (
                      <CalendarRange className="size-3.5 text-muted-foreground" />
                    ) : null}
                    {formatEventDateRange(event)}
                  </dd>
                </div>

                {event.subtitle ? (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Details
                    </dt>
                    <dd className="mt-1 text-muted-foreground">{event.subtitle}</dd>
                  </div>
                ) : null}

                {event.status ? (
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </dt>
                    <dd className="mt-1 capitalize">{event.status.replace(/_/g, " ")}</dd>
                  </div>
                ) : null}
              </dl>

              {event.href ? (
                <Link
                  href={event.href}
                  className={buttonVariants({
                    className: "w-full gap-1.5",
                  })}
                >
                  {SOURCE_LINK_LABEL[event.category] ?? "Open source"}
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
