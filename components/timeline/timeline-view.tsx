"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, GanttChart, List } from "lucide-react";

import { TimelineAgenda } from "@/components/timeline/timeline-agenda";
import { TimelineEventDetailSheet } from "@/components/timeline/timeline-event-detail-sheet";
import { TimelineHorizon } from "@/components/timeline/timeline-horizon";
import { TimelineMonth } from "@/components/timeline/timeline-month";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type TimelineCategory,
  type TimelineEvent,
} from "@/lib/timeline/types";
import { filterEvents } from "@/lib/timeline/utils";
import { cn } from "@/lib/utils";

type CategoryFilter = TimelineCategory | "all";

const FILTER_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  ...CATEGORY_ORDER.map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  })),
];

export function TimelineView({
  events: initialEvents,
}: {
  events: TimelineEvent[];
}) {
  const router = useRouter();
  const [events, setEvents] = React.useState(initialEvents);
  const [category, setCategory] = React.useState<CategoryFilter>("all");
  const [hidePaid, setHidePaid] = React.useState(true);
  const [selectedEvent, setSelectedEvent] = React.useState<TimelineEvent | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("horizon");

  const isHorizon = activeTab === "horizon";

  React.useEffect(() => {
    setEvents(initialEvents);
    setSelectedEvent((prev) => {
      if (!prev) return prev;
      return initialEvents.find((e) => e.id === prev.id) ?? null;
    });
  }, [initialEvents]);

  React.useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  const filtered = React.useMemo(
    () => filterEvents(events, category, { hidePaid }),
    [events, category, hidePaid],
  );

  const milestoneCount = filtered.filter((e) => e.kind === "milestone").length;
  const rangeCount = filtered.filter((e) => e.kind === "range").length;
  const overdueEvents = filtered.filter((e) => e.urgency === "overdue");

  function handleSelectEvent(event: TimelineEvent) {
    setSelectedEvent(event);
    setDetailOpen(true);
  }

  function showOverdue() {
    setActiveTab("agenda");
    if (overdueEvents[0]) {
      setSelectedEvent(overdueEvents[0]);
      setDetailOpen(true);
    }
  }

  const filters = (
    <>
      <Select
        className="w-[160px] text-[13px]"
        value={category}
        onChange={(e) => setCategory(e.target.value as CategoryFilter)}
        aria-label="Filter timeline source"
      >
        {FILTER_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
        <Switch
          checked={hidePaid}
          onCheckedChange={setHidePaid}
          aria-label="Hide paid payments"
        />
        Hide paid
      </label>
    </>
  );

  const stats = (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span>
        <span className="font-medium text-foreground tabular-nums">
          {filtered.length}
        </span>{" "}
        events
      </span>
      <span>
        {milestoneCount} milestones · {rangeCount} ranges
      </span>
      {overdueEvents.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={showOverdue}
        >
          {overdueEvents.length} overdue — view
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className={cn(
          isHorizon
            ? "-m-5 flex min-h-[calc(100dvh-3.5rem)] flex-col"
            : "space-y-4",
        )}
      >
        <div
          className={cn(
            "z-10 bg-background/95 backdrop-blur",
            isHorizon
              ? "shrink-0 space-y-0 border-b"
              : "sticky top-0 -mx-1 space-y-3 px-1 pb-3",
          )}
        >
          {isHorizon ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
              <h1 className="text-lg font-semibold tracking-tight shrink-0">
                Timeline
              </h1>
              <TabsList className="h-8">
                <TabsTrigger value="horizon" className="text-xs">
                  <GanttChart className="size-3.5" />
                  Horizon
                </TabsTrigger>
                <TabsTrigger value="month" className="text-xs">
                  <CalendarDays className="size-3.5" />
                  Month
                </TabsTrigger>
                <TabsTrigger value="agenda" className="text-xs">
                  <List className="size-3.5" />
                  Agenda
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-wrap items-center gap-3 ml-auto">
                {filters}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Timeline
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                    Campaign windows, manufacturing arrivals, PO deliveries,
                    and payment due dates in one place.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {filters}
                </div>
              </div>
              {stats}
              <TabsList>
                <TabsTrigger value="horizon">
                  <GanttChart className="size-3.5" />
                  Horizon
                </TabsTrigger>
                <TabsTrigger value="month">
                  <CalendarDays className="size-3.5" />
                  Month
                </TabsTrigger>
                <TabsTrigger value="agenda">
                  <List className="size-3.5" />
                  Agenda
                </TabsTrigger>
              </TabsList>
            </>
          )}
        </div>

        <TabsContent
          value="horizon"
          className={cn(
            "mt-0 outline-none",
            isHorizon && "flex flex-1 min-h-0 flex-col",
          )}
        >
          <TimelineHorizon
            events={filtered}
            selectedEventId={selectedEvent?.id}
            onSelectEvent={handleSelectEvent}
            className={isHorizon ? "flex-1 min-h-0" : undefined}
          />
        </TabsContent>
        <TabsContent value="month" className={cn(isHorizon ? "mt-0 p-5" : "")}>
          <TimelineMonth
            events={filtered}
            selectedEventId={selectedEvent?.id}
            onSelectEvent={handleSelectEvent}
          />
        </TabsContent>
        <TabsContent
          value="agenda"
          className={cn(isHorizon ? "mt-0 p-5" : "")}
        >
          <TimelineAgenda
            events={filtered}
            selectedEventId={selectedEvent?.id}
            onSelectEvent={handleSelectEvent}
          />
        </TabsContent>
      </Tabs>

      <TimelineEventDetailSheet
        event={selectedEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
