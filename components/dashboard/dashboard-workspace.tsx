"use client";

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  CircleCheck,
  Clock3,
  DollarSign,
  Factory,
  LayoutDashboard,
  RotateCcw,
  Settings2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { ChannelMixCard } from "@/components/dashboard/channel-mix-card";
import { CompoundKpiTile } from "@/components/dashboard/compound-kpi-tile";
import { KpiTile, statusDotClass } from "@/components/dashboard/kpi-tile";
import { AnimatedValue } from "@/components/dashboard/animated-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  formatCount,
  formatUsd,
  type ArAging,
  type CashSnapshot,
  type EmailAffiliate,
  type InProduction,
  type PoPayments,
  type PoWholesaleRevenue,
  type RevenueByChannel,
  type RevenueTrend,
  type WholesalePipeline,
} from "@/lib/dashboard/metrics";
import {
  formatStaleness,
  tileStatus,
  type TileStatus,
} from "@/lib/dashboard/staleness";

type DashboardView = "overview" | "growth" | "operations";

type CardId =
  | "channelMix"
  | "dtcRevenue"
  | "totalWholesale"
  | "aov"
  | "qbWholesale"
  | "emailAffiliate"
  | "pipeline"
  | "cash"
  | "ar"
  | "purchaseOrders"
  | "production";

type DashboardPrefs = {
  view: DashboardView;
  hiddenCards: CardId[];
};

type StaleAfter = {
  qb: number;
  shopify: number;
  klaviyo: number;
  hubspot: number;
};

type Props = {
  email: string;
  staleAfter: StaleAfter;
  cash: CashSnapshot;
  ar: ArAging;
  revenue: RevenueTrend;
  marketing: EmailAffiliate;
  pipeline: WholesalePipeline;
  poPayments: PoPayments;
  production: InProduction;
  channels: RevenueByChannel;
  poWholesale: PoWholesaleRevenue;
};

const CARD_OPTIONS: { id: CardId; label: string }[] = [
  { id: "channelMix", label: "Channel mix" },
  { id: "dtcRevenue", label: "DTC revenue" },
  { id: "totalWholesale", label: "Total wholesale" },
  { id: "aov", label: "AOV" },
  { id: "qbWholesale", label: "QB wholesale" },
  { id: "emailAffiliate", label: "Email and affiliate" },
  { id: "pipeline", label: "Wholesale pipeline" },
  { id: "cash", label: "Cash position" },
  { id: "ar", label: "AR aging" },
  { id: "purchaseOrders", label: "Purchase orders" },
  { id: "production", label: "In production" },
];

const VIEW_OPTIONS: DashboardView[] = ["overview", "growth", "operations"];
const DEFAULT_PREFS: DashboardPrefs = { view: "overview", hiddenCards: [] };
const PREFS_CHANGED_EVENT = "glow-dashboard-prefs-changed";
const prefsCache = new Map<
  string,
  { raw: string | null; value: DashboardPrefs }
>();

function isDashboardView(value: string): value is DashboardView {
  return VIEW_OPTIONS.includes(value as DashboardView);
}

function isCardId(value: string): value is CardId {
  return CARD_OPTIONS.some((option) => option.id === value);
}

function normalizePrefs(value: unknown): DashboardPrefs {
  if (!value || typeof value !== "object") return DEFAULT_PREFS;
  const maybe = value as Partial<DashboardPrefs>;
  const view =
    typeof maybe.view === "string" && isDashboardView(maybe.view)
      ? maybe.view
      : DEFAULT_PREFS.view;
  const hiddenCards = Array.isArray(maybe.hiddenCards)
    ? maybe.hiddenCards.filter(
        (card): card is CardId => typeof card === "string" && isCardId(card),
      )
    : DEFAULT_PREFS.hiddenCards;
  return { view, hiddenCards: [...new Set(hiddenCards)] };
}

function storageKey(email: string): string {
  return `glow-os:dashboard:${email || "unknown"}:v1`;
}

function readPrefs(key: string): DashboardPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;

  const raw = window.localStorage.getItem(key);
  const cached = prefsCache.get(key);
  if (cached?.raw === raw) return cached.value;

  let value = DEFAULT_PREFS;
  try {
    value = raw ? normalizePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    value = DEFAULT_PREFS;
  }

  prefsCache.set(key, { raw, value });
  return value;
}

function writePrefs(key: string, prefs: DashboardPrefs) {
  if (typeof window === "undefined") return;

  const value = normalizePrefs(prefs);
  const raw = JSON.stringify(value);
  prefsCache.set(key, { raw, value });
  window.localStorage.setItem(key, raw);
  window.dispatchEvent(new Event(PREFS_CHANGED_EVENT));
}

function subscribePrefs(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PREFS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PREFS_CHANGED_EVENT, onStoreChange);
  };
}

function latestIso(...dates: (string | null | undefined)[]): string | null {
  const valid = dates
    .filter((date): date is string => Boolean(date))
    .map((date) => ({ date, time: Date.parse(date) }))
    .filter((entry) => !Number.isNaN(entry.time))
    .sort((a, b) => b.time - a.time);
  return valid[0]?.date ?? null;
}

function SourceDot({ status }: { status: TileStatus }) {
  return (
    <span
      className={cn(
        "size-1.5 rounded-full",
        statusDotClass(status),
        status === "live" && "animate-pulse",
      )}
      aria-hidden
    />
  );
}

function PreferenceButton({
  prefs,
  setPrefs,
  visible,
  reset,
}: {
  prefs: DashboardPrefs;
  setPrefs: (updater: (current: DashboardPrefs) => DashboardPrefs) => void;
  visible: (id: CardId) => boolean;
  reset: () => void;
}) {
  const hiddenCount = prefs.hiddenCards.length;

  const toggleCard = (id: CardId, checked: boolean) => {
    setPrefs((current) => {
      const hidden = new Set(current.hiddenCards);
      if (checked) hidden.delete(id);
      else hidden.add(id);
      return { ...current, hiddenCards: [...hidden] };
    });
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" />
        }
        aria-label="Customize dashboard"
      >
        <Settings2 className="size-3.5" />
        <span className="hidden sm:inline">Customize</span>
        {hiddenCount > 0 ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {hiddenCount}
          </Badge>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Dashboard cards</PopoverTitle>
        </PopoverHeader>

        <div className="grid gap-1">
          {CARD_OPTIONS.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
            >
              <span>{option.label}</span>
              <Switch
                checked={visible(option.id)}
                onCheckedChange={(checked) => toggleCard(option.id, checked)}
                size="sm"
                aria-label={`Show ${option.label}`}
              />
            </label>
          ))}
        </div>

        <div className="border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={reset}
          >
            <RotateCcw className="size-3.5" />
            Reset cards
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PulseMetric({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <Card
      className={cn(
        "min-h-[132px]",
        tone === "success" && "ring-success/25",
        tone === "warning" && "ring-warning/30",
        tone === "danger" && "ring-danger/30",
      )}
    >
      <CardContent className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[13px] font-medium text-muted-foreground">
              {label}
            </div>
            <div className="text-2xl font-semibold num">{value}</div>
          </div>
          <span
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground",
              tone === "success" && "bg-success/10 text-success",
              tone === "warning" && "bg-warning/10 text-warning",
              tone === "danger" && "bg-danger/10 text-danger",
            )}
          >
            <Icon className="size-4" />
          </span>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function AttentionQueue({
  ar,
  channels,
  poPayments,
  production,
}: {
  ar: ArAging;
  channels: RevenueByChannel;
  poPayments: PoPayments;
  production: InProduction;
}) {
  const arOver60 = ar.buckets.d60 + ar.buckets.d90 + ar.buckets.over90;
  const items: {
    key: string;
    title: string;
    detail: string;
    tone: "warning" | "danger" | "neutral" | "success";
    icon: LucideIcon;
  }[] = [];

  if (poPayments.overdueCount > 0) {
    items.push({
      key: "po-overdue",
      title: "PO payments overdue",
      detail: `${formatCount(poPayments.overdueCount)} payments / ${formatUsd(
        poPayments.overdueAmount,
      )}`,
      tone: "danger",
      icon: AlertTriangle,
    });
  }

  if (poPayments.dueNext14Count > 0) {
    items.push({
      key: "po-due",
      title: "PO cash out in 14 days",
      detail: `${formatCount(poPayments.dueNext14Count)} payments / ${formatUsd(
        poPayments.dueNext14Amount,
      )}`,
      tone: "warning",
      icon: Clock3,
    });
  }

  if (poPayments.openCount > 0) {
    items.push({
      key: "po-open",
      title: "Open PO book",
      detail: `${formatCount(poPayments.openCount)} POs / ${formatUsd(
        poPayments.openAmount,
      )} committed`,
      tone: "neutral",
      icon: WalletCards,
    });
  }

  if (arOver60 > 0) {
    items.push({
      key: "ar-aging",
      title: "Receivables over 60 days",
      detail: `${formatUsd(arOver60)} aged / ${formatUsd(ar.arTotal)} total AR`,
      tone: "warning",
      icon: WalletCards,
    });
  }

  if (production.arrivingNext14Count > 0) {
    items.push({
      key: "manufacturing-arrivals",
      title: "Manufacturing arrivals soon",
      detail: `${formatCount(
        production.arrivingNext14Count,
      )} runs / ${formatCount(production.arrivingNext14Units)} units`,
      tone: "warning",
      icon: Factory,
    });
  }

  if (!channels.hasData) {
    items.push({
      key: "channel-sync",
      title: "Channel split waiting",
      detail: "QuickBooks class data has not populated yet",
      tone: "neutral",
      icon: BarChart3,
    });
  } else if (channels.totalOther > 0) {
    items.push({
      key: "channel-other",
      title: "Unclassified revenue",
      detail: `${formatUsd(channels.totalOther)} needs a channel class`,
      tone: "warning",
      icon: BarChart3,
    });
  }

  if (items.length === 0) {
    items.push({
      key: "clear",
      title: "No obvious dashboard flags",
      detail: `${formatCount(
        poPayments.openCount,
      )} open POs / ${formatCount(production.received)} received runs`,
      tone: "success",
      icon: CircleCheck,
    });
  }

  return (
    <Card className="h-full">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Attention</h2>
            <p className="text-xs text-muted-foreground">Cash, AR, and ops cues</p>
          </div>
          <Badge variant="outline" className="text-[11px]">
            {items.length}
          </Badge>
        </div>

        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
                  item.tone === "success" && "bg-success/10 text-success",
                  item.tone === "warning" && "bg-warning/10 text-warning",
                  item.tone === "danger" && "bg-danger/10 text-danger",
                )}
              >
                <item.icon className="size-3.5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs leading-snug text-muted-foreground">
                  {item.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceFreshnessStrip({
  staleAfter,
  cash,
  ar,
  revenue,
  marketing,
  pipeline,
  channels,
}: {
  staleAfter: StaleAfter;
  cash: CashSnapshot;
  ar: ArAging;
  revenue: RevenueTrend;
  marketing: EmailAffiliate;
  pipeline: WholesalePipeline;
  channels: RevenueByChannel;
}) {
  const sources = [
    {
      label: "Shopify",
      syncedAt: revenue.syncedAt,
      staleAfterMs: staleAfter.shopify,
    },
    {
      label: "QuickBooks",
      syncedAt: latestIso(cash.syncedAt, ar.syncedAt, channels.syncedAt),
      staleAfterMs: staleAfter.qb,
    },
    {
      label: "Klaviyo",
      syncedAt: marketing.syncedAt,
      staleAfterMs: staleAfter.klaviyo,
    },
    {
      label: "HubSpot",
      syncedAt: pipeline.syncedAt,
      staleAfterMs: staleAfter.hubspot,
    },
  ];

  return (
    <div className="grid gap-2 rounded-lg border bg-card/50 p-2 sm:grid-cols-2 xl:grid-cols-4">
      {sources.map((source) => {
        const status = tileStatus(source.syncedAt, source.staleAfterMs);
        return (
          <div
            key={source.label}
            className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <SourceDot status={status} />
              <span className="truncate text-xs font-medium">
                {source.label}
              </span>
            </div>
            <span
              className="shrink-0 text-[11px] text-muted-foreground"
              suppressHydrationWarning
            >
              {formatStaleness(source.syncedAt, source.staleAfterMs) ??
                "No sync yet"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HiddenState({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
      <h3 className="text-sm font-medium">All cards are hidden</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Restore the default dashboard card set.
      </p>
      <Button className="mt-4 gap-2" size="sm" onClick={reset}>
        <RotateCcw className="size-3.5" />
        Reset cards
      </Button>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 border-b border-border/70 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

function PurchaseOrdersTile({ poPayments }: { poPayments: PoPayments }) {
  const secondaryValue =
    poPayments.overdueCount > 0
      ? poPayments.overdueCount
      : poPayments.dueNext14Count;
  const secondaryLabel =
    poPayments.overdueCount > 0 ? "overdue payments" : "due next 14d";
  const statusBits = [
    poPayments.confirmedCount > 0
      ? `${formatCount(poPayments.confirmedCount)} confirmed`
      : null,
    poPayments.fulfillmentCount > 0
      ? `${formatCount(poPayments.fulfillmentCount)} fulfillment`
      : null,
    poPayments.shippedCount > 0
      ? `${formatCount(poPayments.shippedCount)} shipped`
      : null,
    poPayments.receivedCount > 0
      ? `${formatCount(poPayments.receivedCount)} received`
      : null,
  ].filter(Boolean);

  return (
    <CompoundKpiTile
      title="Purchase orders"
      primary={{
        label: "open POs",
        value: poPayments.openCount,
      }}
      secondary={{
        label: secondaryLabel,
        value: secondaryValue,
        tone: secondaryValue > 0 ? "warning" : "neutral",
      }}
      hint={`${formatUsd(poPayments.openAmount)} open${
        statusBits.length > 0 ? ` / ${statusBits.join(" / ")}` : ""
      }`}
    />
  );
}

function ManufacturingTile({ production }: { production: InProduction }) {
  const stageBits = [
    production.ordered > 0 ? `${formatCount(production.ordered)} ordered` : null,
    production.inProduction > 0
      ? `${formatCount(production.inProduction)} in production`
      : null,
    production.complete > 0 ? `${formatCount(production.complete)} complete` : null,
    production.inTransit > 0
      ? `${formatCount(production.inTransit)} in transit`
      : null,
  ].filter(Boolean);
  const hint =
    production.total > 0
      ? `${formatCount(production.activeUnits)} active units${
          production.arrivingNext14Count > 0
            ? ` / ${formatCount(production.arrivingNext14Count)} arriving soon`
            : ""
        }`
      : `${formatCount(production.received)} received / ${formatCount(
          production.allCount,
        )} total runs`;

  return (
    <CompoundKpiTile
      title="Manufacturing"
      primary={{
        label: "active",
        value: production.total,
        tone: production.arrivingNext14Count > 0 ? "warning" : "neutral",
      }}
      secondary={{
        label: production.received > 0 ? "received" : "stage details",
        value: production.received > 0 ? production.received : stageBits.length,
      }}
      hint={stageBits.length > 0 ? `${hint} / ${stageBits.join(" / ")}` : hint}
    />
  );
}

export function DashboardWorkspace({
  email,
  staleAfter,
  cash,
  ar,
  revenue,
  marketing,
  pipeline,
  poPayments,
  production,
  channels,
  poWholesale,
}: Props) {
  const key = useMemo(() => storageKey(email), [email]);
  const prefs = useSyncExternalStore(
    subscribePrefs,
    () => readPrefs(key),
    () => DEFAULT_PREFS,
  );

  const setPrefs = useCallback(
    (updater: (current: DashboardPrefs) => DashboardPrefs) => {
      writePrefs(key, updater(readPrefs(key)));
    },
    [key],
  );

  const hiddenCards = useMemo(
    () => new Set<CardId>(prefs.hiddenCards),
    [prefs.hiddenCards],
  );
  const visible = useCallback((id: CardId) => !hiddenCards.has(id), [hiddenCards]);
  const reset = useCallback(() => writePrefs(key, DEFAULT_PREFS), [key]);

  const arOver60 = ar.buckets.d60 + ar.buckets.d90 + ar.buckets.over90;
  const totalWholesaleRevenue =
    revenue.shopifyWholesaleRevenue + poWholesale.total;
  const bookedRevenue = revenue.dtcRevenue + totalWholesaleRevenue;
  const arBucketLabel = `${formatUsd(ar.buckets.current)} curr / ${formatUsd(
    ar.buckets.d30,
  )} 30 / ${formatUsd(ar.buckets.d60)} 60 / ${formatUsd(
    ar.buckets.d90 + ar.buckets.over90,
  )} 90+`;

  const setView = (value: string) => {
    if (!isDashboardView(value)) return;
    setPrefs((current) => ({ ...current, view: value }));
  };

  const maybe = (id: CardId, node: ReactNode) =>
    visible(id) ? node : null;
  const noVisibleCards = CARD_OPTIONS.every((option) => !visible(option.id));

  return (
    <Tabs value={prefs.view} onValueChange={setView} className="mx-auto max-w-[1500px] gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="size-5 text-brand" />
            <h1 className="text-2xl font-semibold">Dashboard</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Business health across revenue, cash, receivables, and operations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="growth">Growth</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
          </TabsList>
          <PreferenceButton
            prefs={prefs}
            setPrefs={setPrefs}
            visible={visible}
            reset={reset}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PulseMetric
          icon={TrendingUp}
          label="Booked revenue"
          value={
            <AnimatedValue value={bookedRevenue} format="usd" />
          }
          sub={`${formatUsd(revenue.dtcRevenue)} DTC / ${formatUsd(
            totalWholesaleRevenue,
          )} wholesale`}
          tone={bookedRevenue > 0 ? "success" : "neutral"}
        />
        <PulseMetric
          icon={DollarSign}
          label="Cash position"
          value={<AnimatedValue value={cash.cashPosition} format="usd" />}
          sub="QuickBooks balance snapshot"
          tone={(cash.cashPosition ?? 0) > 0 ? "success" : "neutral"}
        />
        <PulseMetric
          icon={WalletCards}
          label="AR over 60 days"
          value={<AnimatedValue value={arOver60} format="usd" />}
          sub={`${formatUsd(ar.arTotal)} total receivables`}
          tone={arOver60 > 0 ? "warning" : "success"}
        />
        <PulseMetric
          icon={Factory}
          label="Open work"
          value={
            <span className="num">
              {formatCount(poPayments.openCount + production.total)}
            </span>
          }
          sub={`${formatUsd(poPayments.openAmount)} open POs / ${formatCount(
            production.total,
          )} active manufacturing`}
          tone={poPayments.overdueCount > 0 ? "warning" : "neutral"}
        />
      </div>

      <SourceFreshnessStrip
        staleAfter={staleAfter}
        cash={cash}
        ar={ar}
        revenue={revenue}
        marketing={marketing}
        pipeline={pipeline}
        channels={channels}
      />

      {noVisibleCards ? (
        <HiddenState reset={reset} />
      ) : (
        <>
          <TabsContent value="overview" className="mt-0">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
              <div className="space-y-5">
                {maybe(
                  "channelMix",
                  <ChannelMixCard
                    points={channels.points.map((p) => ({
                      date: p.date,
                      dtc: p.dtc,
                      wholesale: p.wholesale,
                    }))}
                    totalDtc={channels.totalDtc}
                    totalWholesale={channels.totalWholesale}
                    totalOther={channels.totalOther}
                    dtcShare={channels.dtcShare}
                    wholesaleShare={channels.wholesaleShare}
                    dtcDelta={channels.dtcDelta}
                    wholesaleDelta={channels.wholesaleDelta}
                    syncedAt={channels.syncedAt}
                    staleAfterMs={staleAfter.qb}
                    hasData={channels.hasData}
                  />,
                )}

                <Section title="Top metrics" subtitle="Trailing 30 days">
                  <MetricGrid>
                    {maybe(
                      "dtcRevenue",
                      <KpiTile
                        title="DTC revenue"
                        rawValue={revenue.dtcRevenue}
                        format="usd"
                        sub={`${formatCount(revenue.dtcOrders)} orders / excl. B2B`}
                        hint="Shopify"
                        syncedAt={revenue.syncedAt}
                        staleAfterMs={staleAfter.shopify}
                        trend={revenue.dtcTrend}
                        delta={revenue.dtcDelta}
                      />,
                    )}
                    {maybe(
                      "totalWholesale",
                      <KpiTile
                        title="Total wholesale"
                        rawValue={totalWholesaleRevenue}
                        format="usd"
                        sub={`${formatUsd(
                          revenue.shopifyWholesaleRevenue,
                        )} Shopify B2B / ${formatUsd(poWholesale.total)} POs`}
                        hint="Shopify B2B tags + customer POs"
                        syncedAt={revenue.syncedAt}
                        staleAfterMs={staleAfter.shopify}
                        trend={poWholesale.trend}
                        delta={poWholesale.delta}
                      />,
                    )}
                    {maybe(
                      "cash",
                      <KpiTile
                        title="Cash position"
                        rawValue={cash.cashPosition}
                        format="usd"
                        hint="QuickBooks"
                        syncedAt={cash.syncedAt}
                        staleAfterMs={staleAfter.qb}
                        trend={cash.trend}
                        delta={cash.delta}
                      />,
                    )}
                  </MetricGrid>
                </Section>
              </div>

              <div className="space-y-5">
                <AttentionQueue
                  ar={ar}
                  channels={channels}
                  poPayments={poPayments}
                  production={production}
                />

                <MetricGrid>
                  {maybe("purchaseOrders", <PurchaseOrdersTile poPayments={poPayments} />)}
                  {maybe("production", <ManufacturingTile production={production} />)}
                </MetricGrid>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="growth" className="mt-0">
            <div className="space-y-5">
              {maybe(
                "channelMix",
                <ChannelMixCard
                  points={channels.points.map((p) => ({
                    date: p.date,
                    dtc: p.dtc,
                    wholesale: p.wholesale,
                  }))}
                  totalDtc={channels.totalDtc}
                  totalWholesale={channels.totalWholesale}
                  totalOther={channels.totalOther}
                  dtcShare={channels.dtcShare}
                  wholesaleShare={channels.wholesaleShare}
                  dtcDelta={channels.dtcDelta}
                  wholesaleDelta={channels.wholesaleDelta}
                  syncedAt={channels.syncedAt}
                  staleAfterMs={staleAfter.qb}
                  hasData={channels.hasData}
                />,
              )}

              <Section title="Revenue engine" subtitle="Demand and mix">
                <MetricGrid>
                  {maybe(
                    "dtcRevenue",
                    <KpiTile
                      title="DTC revenue"
                      rawValue={revenue.dtcRevenue}
                      format="usd"
                      sub={`${formatCount(revenue.dtcOrders)} orders / excl. B2B`}
                      hint="Shopify"
                      syncedAt={revenue.syncedAt}
                      staleAfterMs={staleAfter.shopify}
                      trend={revenue.dtcTrend}
                      delta={revenue.dtcDelta}
                    />,
                  )}
                  {maybe(
                    "totalWholesale",
                    <KpiTile
                      title="Total wholesale"
                      rawValue={totalWholesaleRevenue}
                      format="usd"
                      sub={`${formatUsd(
                        revenue.shopifyWholesaleRevenue,
                      )} Shopify B2B / ${formatUsd(poWholesale.total)} POs`}
                      hint="Shopify B2B tags + customer POs"
                      syncedAt={revenue.syncedAt}
                      staleAfterMs={staleAfter.shopify}
                      trend={poWholesale.trend}
                      delta={poWholesale.delta}
                    />,
                  )}
                  {maybe(
                    "aov",
                    <KpiTile
                      title="AOV"
                      rawValue={revenue.aov}
                      format="usd"
                      fractionDigits={2}
                      sub="30-day weighted"
                      hint="Shopify"
                      syncedAt={revenue.syncedAt}
                      staleAfterMs={staleAfter.shopify}
                      trend={revenue.aovTrend}
                      delta={revenue.aovDelta}
                    />,
                  )}
                  {maybe(
                    "qbWholesale",
                    <KpiTile
                      title="Wholesale revenue (QB)"
                      rawValue={channels.hasData ? channels.totalWholesale : null}
                      format="usd"
                      sub={
                        channels.hasData
                          ? `${(channels.wholesaleShare * 100).toFixed(
                              0,
                            )}% of channel mix`
                          : "Awaiting QuickBooks class sync"
                      }
                      hint="QuickBooks"
                      syncedAt={channels.syncedAt}
                      staleAfterMs={staleAfter.qb}
                      trend={channels.wholesaleTrend}
                      delta={channels.wholesaleDelta}
                    />,
                  )}
                  {maybe(
                    "emailAffiliate",
                    <KpiTile
                      title="Email + affiliate revenue"
                      rawValue={marketing.total}
                      format="usd"
                      sub={`${formatUsd(marketing.emailRevenue)} email / ${formatUsd(
                        marketing.affiliateRevenue,
                      )} affiliate`}
                      hint="Klaviyo"
                      syncedAt={marketing.syncedAt}
                      staleAfterMs={staleAfter.klaviyo}
                      trend={marketing.trend}
                      delta={marketing.delta}
                    />,
                  )}
                  {maybe(
                    "pipeline",
                    <KpiTile
                      title="Wholesale pipeline"
                      rawValue={pipeline.totalOpenAmount}
                      format="usd"
                      sub={`${formatCount(pipeline.openDealCount)} open deals`}
                      hint="HubSpot"
                      syncedAt={pipeline.syncedAt}
                      staleAfterMs={staleAfter.hubspot}
                      trend={pipeline.trend}
                      delta={pipeline.delta}
                    />,
                  )}
                </MetricGrid>
              </Section>
            </div>
          </TabsContent>

          <TabsContent value="operations" className="mt-0">
            <div className="space-y-5">
              <Section title="Cash and receivables" subtitle="Position today">
                <MetricGrid>
                  {maybe(
                    "cash",
                    <KpiTile
                      title="Cash position"
                      rawValue={cash.cashPosition}
                      format="usd"
                      hint="QuickBooks"
                      syncedAt={cash.syncedAt}
                      staleAfterMs={staleAfter.qb}
                      trend={cash.trend}
                      delta={cash.delta}
                    />,
                  )}
                  {maybe(
                    "ar",
                    <KpiTile
                      title="AR aging"
                      rawValue={ar.arTotal}
                      format="usd"
                      sub={arBucketLabel}
                      hint="0/30/60/90+ from QuickBooks"
                      syncedAt={ar.syncedAt}
                      staleAfterMs={staleAfter.qb}
                      trend={ar.trend}
                      delta={ar.delta}
                    />,
                  )}
                </MetricGrid>
              </Section>

              <Section title="Operations" subtitle="POs and manufacturing">
                <MetricGrid>
                  {maybe("purchaseOrders", <PurchaseOrdersTile poPayments={poPayments} />)}
                  {maybe("production", <ManufacturingTile production={production} />)}
                </MetricGrid>
              </Section>
            </div>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
