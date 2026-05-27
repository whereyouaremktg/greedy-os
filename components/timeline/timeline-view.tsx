"use client";

import * as React from "react";
import { CalendarDays, GanttChart, List } from "lucide-react";

import { TimelineAgenda } from "@/components/timeline/timeline-agenda";
import { TimelineHorizon } from "@/components/timeline/timeline-horizon";
import { TimelineMonth } from "@/components/timeline/timeline-month";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type TimelineCategory,
  type TimelineEvent,
} from "@/lib/timeline/types";
import { filterEvents } from "@/lib/timeline/utils";

type CategoryFilter = TimelineCategory | "all";

const FILTER_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  ...CATEGORY_ORDER.map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
  })),
];

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [category, setCategory] = React.useState<CategoryFilter>("all");
  const [hidePaid, setHidePaid] = React.useState(true);

  const filtered = React.useMemo(
    () => filterEvents(events, category, { hidePaid }),
    [events, category, hidePaid],
  );

  const milestoneCount = filtered.filter((e) => e.kind === "milestone").length;
  const rangeCount = filtered.filter((e) => e.kind === "range").length;
  const overdueCount = filtered.filter((e) => e.urgency === "overdue").length;

  return (
    <Tabs defaultValue="horizon" className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Campaign windows, manufacturing arrivals, PO deliveries, payment
              due dates, and deal close dates in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Select
              className="w-[180px] text-[13px]"
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CategoryFilter)
              }
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
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {filtered.length}
            </span>{" "}
            events
          </span>
          <span>
            {milestoneCount} milestones · {rangeCount} ranges
          </span>
          {overdueCount > 0 ? (
            <span className="text-destructive font-medium">
              {overdueCount} overdue
            </span>
          ) : null}
        </div>

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
      </div>

      <TabsContent value="horizon">
        <TimelineHorizon events={filtered} />
      </TabsContent>
      <TabsContent value="month">
        <TimelineMonth events={filtered} />
      </TabsContent>
      <TabsContent value="agenda">
        <TimelineAgenda events={filtered} />
      </TabsContent>
    </Tabs>
  );
}
