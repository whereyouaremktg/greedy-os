"use client";

import { CalendarClock, ListTodo, Megaphone } from "lucide-react";

import type { CampaignRow } from "@/components/campaigns/types";
import { computeCampaignSummary } from "@/components/campaigns/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: number;
  hint: string;
  icon: typeof Megaphone;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-[13px] font-medium text-muted-foreground leading-none">
          {title}
        </CardTitle>
        <Icon className="size-4 text-muted-foreground/70" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tracking-tight num">{value}</div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function CampaignSummary({ campaigns }: { campaigns: CampaignRow[] }) {
  const summary = computeCampaignSummary(campaigns);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <SummaryCard
        title="Active campaigns"
        value={summary.active}
        hint={`${summary.planning} in planning`}
        icon={Megaphone}
      />
      <SummaryCard
        title="Tasks due this week"
        value={summary.tasksDueThisWeek}
        hint="Across all open campaigns"
        icon={ListTodo}
      />
      <SummaryCard
        title="Launching soon"
        value={summary.launchingSoon}
        hint="Start date within 14 days"
        icon={CalendarClock}
      />
    </div>
  );
}
