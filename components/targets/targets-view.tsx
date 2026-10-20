"use client";

import { useState } from "react";
import { AlertTriangle, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/nav/page-header";
import { RelativeTime } from "@/components/relative-time";
import { cn } from "@/lib/utils";
import type { TargetsData } from "@/lib/targets/queries";
import { BfcmModule } from "@/components/targets/bfcm-module";
import { GoalProgress } from "@/components/targets/goal-progress";
import { GuardrailBadges } from "@/components/targets/guardrails";
import { RefreshButton } from "@/components/targets/refresh-button";
import {
  B2bSection,
  DtcSection,
  MarketingLine,
  MarketplacesSection,
} from "@/components/targets/revenue-sections";
import { WholesaleTracker } from "@/components/targets/wholesale-tracker";
import { ProfitabilityPanel } from "@/components/targets/profitability-panel";
import { FulfillmentSection } from "@/components/targets/fulfillment-section";
import { LaunchTracker } from "@/components/targets/launch-tracker";
import { TargetsSettingsSheet } from "@/components/targets/targets-settings-sheet";
import { dateTimeLabel } from "@/components/targets/format";

export function TargetsView({ data }: { data: TargetsData }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { sync } = data;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        title={`Q4 ${data.settings.year} Targets`}
        description="Oct 1 – Dec 31, paid orders only, store time (Phoenix). Where we are vs target, what is driving the gap, and whether growth is profitable."
        actions={
          <div className="flex items-center gap-2">
            <SyncPill sync={sync} />
            <RefreshButton disabled={sync.inProgress} />
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} aria-label="Targets settings">
              <Settings2 />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        }
      />

      {sync.ok === false && sync.message ? (
        <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
          <div>
            <span className="font-medium">Last sync failed.</span> {sync.message}
          </div>
        </div>
      ) : null}

      {!data.hasOrders ? (
        <EmptyState
          title="No Shopify orders synced yet"
          description="The Q4 Targets sync has not run for this quarter. Refresh to pull paid orders from Shopify; the first pass takes a minute."
          action={<RefreshButton />}
        />
      ) : (
        <>
          <GoalProgress
            pace={data.pace}
            tiers={data.tiers}
            totalLastYearToDate={data.revenue.totalLastYearToDate}
            baselineTotal={data.baseline.total2025}
            today={data.today}
          />

          <GuardrailBadges guardrails={data.guardrails} onEdit={() => setSettingsOpen(true)} />

          {!data.hasBaseline ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
              Last year&apos;s orders are not synced yet, so year-over-year and the BFCM-weighted pace are
              blank. The baseline backfill runs automatically; refresh in a few minutes.
            </div>
          ) : null}

          <DtcSection data={data} />
          <MarketplacesSection data={data} />
          <B2bSection data={data} />
          <WholesaleTracker summary={data.wholesale} />
          <MarketingLine data={data} />
          <BfcmModule data={data} />
          <FulfillmentSection fulfillment={data.fulfillment} settings={data.settings} />
          <ProfitabilityPanel profit={data.profit} settings={data.settings} />
          <LaunchTracker launches={data.launches} />

          <p className="text-[11px] text-muted-foreground">
            Shopify data as of{" "}
            {sync.dataAsOf ? dateTimeLabel(sync.dataAsOf) : "—"} Phoenix time. Net sales = gross merchandise −
            discounts − returns, before shipping and tax, matching Shopify Analytics. Baseline Shopify Q4{" "}
            {data.settings.year - 1}: {data.baseline.shopifyNet2025.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{" "}
            across {data.baseline.shopifyOrders2025.toLocaleString("en-US")} paid orders with the same rules.
          </p>
        </>
      )}

      <TargetsSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} settings={data.settings} />
    </div>
  );
}

function SyncPill({ sync }: { sync: TargetsData["sync"] }) {
  const tone = sync.inProgress ? "warning" : sync.ok === false ? "danger" : "success";
  return (
    <Badge
      variant="outline"
      className={cn(
        "hidden h-7 gap-1.5 px-2.5 text-[11px] font-normal text-muted-foreground sm:inline-flex",
        tone === "danger" && "border-danger/50",
        tone === "warning" && "border-warning/50",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning animate-pulse",
          tone === "danger" && "bg-danger",
        )}
      />
      {sync.inProgress ? "Syncing" : sync.dataAsOf ? <>Synced <RelativeTime iso={sync.dataAsOf} /></> : "Not synced"}
    </Badge>
  );
}
