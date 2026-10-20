"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { saveFulfillmentRates } from "@/lib/actions/targets";
import type { FulfillmentData } from "@/lib/targets/fulfillment-data";
import type { FulfillmentWeek } from "@/lib/targets/fulfillment";
import type { TargetsSettings } from "@/lib/targets/settings";
import { weekLabel } from "@/lib/targets/profit";
import { Field, MoneyInput } from "@/components/targets/field";
import { SectionHeading } from "@/components/targets/revenue-sections";
import { useCssVars } from "@/components/targets/use-css-vars";
import { count, dateTimeLabel, ratioPct, usd } from "@/components/targets/format";

const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function usd2(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : money2.format(n);
}
function hours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function FulfillmentSection({
  fulfillment,
  settings,
}: {
  fulfillment: FulfillmentData;
  settings: TargetsSettings;
}) {
  const [ratesOpen, setRatesOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const q = fulfillment.quarter;
  const ratesSet = settings.fulfillment.pick_pack_per_order != null;
  const postageOnly = !ratesSet;
  const sync = fulfillment.sync;

  const costLabel = postageOnly ? "Postage per order" : "Fulfillment per order";
  const costSub = postageOnly
    ? "Postage only — add the RetroShip pick/pack rate to see the full cost"
    : `Postage ${usd2(q.postagePerOrder)} + pick/pack & packaging`;

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Fulfillment"
        note="Postage is actual, from RetroShip (ShipHero) labels matched to each Shopify order. Pick/pack and packaging come from the rate card."
      />

      {!fulfillment.hasShipments ? (
        <Card size="sm" className="py-0">
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Truck className="size-5 text-muted-foreground" />
            <div className="text-sm font-medium">No ShipHero shipments synced for this quarter yet</div>
            <p className="max-w-md text-xs text-muted-foreground">
              Refresh pulls shipments and their label costs from ShipHero after the Shopify orders. Shipping charged to
              customers is already here; postage, carrier mix and fulfillment cost appear once the first sync lands.
              {sync.message && sync.ok === false ? ` Last attempt failed: ${sync.message}` : ""}
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiTile
              title={costLabel}
              value={usd2(postageOnly ? q.postagePerOrder : q.fulfillmentPerOrder)}
              sub={costSub}
              hint={`${count(q.shippedOrders)} of ${count(q.orders)} paid orders matched to a shipment (${ratioPct(q.matchRate, 0)})`}
              status={q.postagePerOrder == null ? "pending" : "live"}
            />
            <KpiTile
              title="Fulfillment % of net sales"
              value={ratioPct(postageOnly ? (q.postageEstimated != null && q.netSales > 0 ? q.postageEstimated / q.netSales : null) : q.fulfillmentPctOfNet)}
              sub={postageOnly ? "Postage ÷ net sales" : "Postage + pick/pack + packaging ÷ net sales"}
              hint={
                q.fulfillmentCost != null
                  ? `${usd(q.fulfillmentCost)} on ${usd(q.netSales)} net, quarter to date`
                  : "Needs a matched postage sample"
              }
            />
            <KpiTile
              title="Shipping recovered"
              value={ratioPct(q.shippingRecovery, 0)}
              sub={
                q.netShipping != null
                  ? `${usd(q.shippingCharged)} charged vs ${usd(q.postageEstimated)} postage · ${q.netShipping < 0 ? usd(-q.netShipping) + " subsidized" : usd(q.netShipping) + " surplus"}`
                  : `${usd(q.shippingCharged)} charged to customers`
              }
              hint="Share of postage the customer paid for"
            />
            <KpiTile
              title="Time to ship"
              value={hours(q.p50HoursToShip)}
              sub={`Median order → first shipment · avg ${hours(q.avgHoursToShip)}`}
              hint="From Shopify fulfillments, paid orders"
            />
          </div>

          <Card size="sm" className="py-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Weekly cost per order. {postageOnly ? "Bars are postage only until the rate card is set." : "Bars stack postage, pick/pack and packaging."}{" "}
                The line is what customers paid for shipping.
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? "Chart" : "Table"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRatesOpen(true)}>
                  <Pencil />
                  Rate card
                </Button>
              </div>
            </div>
            {showTable ? (
              <WeeklyTable weeks={fulfillment.weeks} postageOnly={postageOnly} />
            ) : (
              <div className="px-2 py-3">
                <WeeklyChart weeks={fulfillment.weeks} postageOnly={postageOnly} />
              </div>
            )}
          </Card>

          <div className="grid gap-3 lg:grid-cols-5">
            <Card size="sm" className="py-0 lg:col-span-3">
              <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                Carrier mix on matched paid orders, quarter to date.
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carrier · service</TableHead>
                    <TableHead className="text-right">Shipments</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Avg postage</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Avg weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fulfillment.carriers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                        No matched shipments yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    fulfillment.carriers.map((c) => (
                      <TableRow key={`${c.carrier}|${c.method}`}>
                        <TableCell>
                          <span className="font-medium">{c.carrier}</span>
                          <span className="text-muted-foreground"> · {c.method}</span>
                        </TableCell>
                        <TableCell className="num text-right">{count(c.shipments)}</TableCell>
                        <TableCell className="num text-right">{ratioPct(c.share, 0)}</TableCell>
                        <TableCell className="num text-right">{usd2(c.avgPostage)}</TableCell>
                        <TableCell className="num text-right hidden md:table-cell">
                          {c.avgWeightLb != null ? `${c.avgWeightLb.toFixed(2)} lb` : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>

            <Card size="sm" className="py-0 lg:col-span-2">
              <div className="border-b px-3 py-2 text-xs text-muted-foreground">Rate card (RetroShip)</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 text-sm">
                <dt className="text-muted-foreground">Pick/pack per order</dt>
                <dd className="num text-right">{usd2(settings.fulfillment.pick_pack_per_order)}</dd>
                <dt className="text-muted-foreground">Per extra unit</dt>
                <dd className="num text-right">{usd2(settings.fulfillment.pick_pack_per_extra_unit)}</dd>
                <dt className="text-muted-foreground">Packaging per order</dt>
                <dd className="num text-right">{usd2(settings.fulfillment.packaging_per_order)}</dd>
                <dt className="text-muted-foreground">Quarter pick/pack + packaging</dt>
                <dd className="num text-right">
                  {q.pickPack != null || q.packaging != null ? usd((q.pickPack ?? 0) + (q.packaging ?? 0)) : "—"}
                </dd>
              </dl>
              <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                {ratesSet
                  ? "Weeks without a RetroShip invoice use this estimate as their 3PL cost in Profitability."
                  : "Set the rates to count pick/pack and packaging as cost of goods. Until then Profitability falls back to postage alone."}
                {settings.fulfillment.notes ? <div className="mt-1 italic">{settings.fulfillment.notes}</div> : null}
              </div>
            </Card>
          </div>

          <p className="text-[11px] text-muted-foreground">
            ShipHero data as of {sync.dataAsOf ? dateTimeLabel(sync.dataAsOf) : "—"} Phoenix time ·{" "}
            {count(sync.shipmentsInWindow)} shipments in the window
            {sync.ok === false && sync.message ? <> · last sync failed: {sync.message}</> : null}
            {q.matchRate < 0.98 && q.shippedOrders > 0
              ? " · postage is extrapolated to unmatched orders at the matched per-order rate"
              : ""}
          </p>
        </>
      )}

      <RatesDialog open={ratesOpen} onOpenChange={setRatesOpen} initial={settings.fulfillment} />
    </section>
  );
}

type ChartRow = {
  label: string;
  weekStart: string;
  postage: number | null;
  pickPack: number | null;
  packaging: number | null;
  charged: number | null;
  isCurrent: boolean;
};

function WeeklyChart({ weeks, postageOnly }: { weeks: FulfillmentWeek[]; postageOnly: boolean }) {
  const vars = useCssVars(["--chart-accent", "--chart-compare", "--border", "--muted-foreground", "--foreground", "--card"] as const);
  const accent = vars["--chart-accent"] || "#d78c42";
  const compare = vars["--chart-compare"] || "#9a948e";
  const grid = vars["--border"] || "#e5e1dc";
  const ink = vars["--muted-foreground"] || "#7a7571";
  const surface = vars["--card"] || "#ffffff";

  const rows = useMemo<ChartRow[]>(
    () =>
      weeks
        .filter((w) => w.orders > 0)
        .map((w) => ({
          label: shortWeek(w.weekStart),
          weekStart: w.weekStart,
          postage: w.postageEstimated != null && w.orders > 0 ? w.postageEstimated / w.orders : null,
          pickPack: w.pickPack != null && w.orders > 0 ? w.pickPack / w.orders : null,
          packaging: w.packaging != null && w.orders > 0 ? w.packaging / w.orders : null,
          charged: w.orders > 0 ? w.shippingCharged / w.orders : null,
          isCurrent: w.isCurrent,
        })),
    [weeks],
  );

  if (rows.length === 0) {
    return <div className="py-10 text-center text-xs text-muted-foreground">No weeks with orders yet.</div>;
  }

  return (
    <div className="h-[220px] w-full" role="img" aria-label="Weekly fulfillment cost per order versus shipping charged per order">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 220 }}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={grid} strokeWidth={1} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 11, fill: ink }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            cursor={{ fill: grid, opacity: 0.4 }}
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [usd2(typeof value === "number" ? value : null), String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
          <Bar dataKey="postage" name="Postage / order" stackId="cost" fill={accent} maxBarSize={24} radius={postageOnly ? [4, 4, 0, 0] : 0} />
          {!postageOnly ? (
            <>
              <Bar dataKey="pickPack" name="Pick/pack / order" stackId="cost" fill={accent} fillOpacity={0.6} maxBarSize={24} stroke={surface} strokeWidth={1} />
              <Bar dataKey="packaging" name="Packaging / order" stackId="cost" fill={accent} fillOpacity={0.35} maxBarSize={24} radius={[4, 4, 0, 0]} stroke={surface} strokeWidth={1} />
            </>
          ) : null}
          <Line type="monotone" dataKey="charged" name="Shipping charged / order" stroke={compare} strokeWidth={2} dot={{ r: 4, fill: compare, stroke: surface, strokeWidth: 2 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function shortWeek(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function WeeklyTable({ weeks, postageOnly }: { weeks: FulfillmentWeek[]; postageOnly: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Week</TableHead>
          <TableHead className="text-right">Orders</TableHead>
          <TableHead className="text-right hidden md:table-cell">Matched</TableHead>
          <TableHead className="text-right">Postage</TableHead>
          <TableHead className="text-right">$ / order</TableHead>
          <TableHead className="text-right hidden md:table-cell">Charged</TableHead>
          <TableHead className="text-right hidden lg:table-cell">Recovered</TableHead>
          {!postageOnly ? <TableHead className="text-right hidden lg:table-cell">Pick/pack + pkg</TableHead> : null}
          <TableHead className="text-right">% of net</TableHead>
          <TableHead className="text-right hidden lg:table-cell">Ship time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {weeks
          .filter((w) => w.orders > 0)
          .map((w) => {
            const pct = postageOnly
              ? w.postageEstimated != null && w.netSales > 0
                ? w.postageEstimated / w.netSales
                : null
              : w.fulfillmentPctOfNet;
            return (
              <TableRow key={w.weekStart} className={cn(w.isCurrent && "font-medium")}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {weekLabel(w.weekStart)}
                    {w.isCurrent ? <Badge variant="outline" className="text-[10px]">this week</Badge> : null}
                  </div>
                  {w.missing.includes("postage") && w.orders > 0 ? (
                    <div className="text-[10px] text-muted-foreground">postage sample too thin</div>
                  ) : w.isEstimate ? (
                    <div className="text-[10px] text-muted-foreground">postage extrapolated</div>
                  ) : null}
                </TableCell>
                <TableCell className="num text-right">{count(w.orders)}</TableCell>
                <TableCell className="num text-right hidden md:table-cell">{ratioPct(w.matchRate, 0)}</TableCell>
                <TableCell className="num text-right">{w.postageEstimated != null ? usd(w.postageEstimated) : "—"}</TableCell>
                <TableCell className="num text-right">{usd2(postageOnly ? w.postagePerOrder : w.fulfillmentPerOrder)}</TableCell>
                <TableCell className="num text-right hidden md:table-cell">{usd(w.shippingCharged)}</TableCell>
                <TableCell className="num text-right hidden lg:table-cell">{ratioPct(w.shippingRecovery, 0)}</TableCell>
                {!postageOnly ? (
                  <TableCell className="num text-right hidden lg:table-cell">
                    {w.pickPack != null || w.packaging != null ? usd((w.pickPack ?? 0) + (w.packaging ?? 0)) : "—"}
                  </TableCell>
                ) : null}
                <TableCell className="num text-right">{ratioPct(pct)}</TableCell>
                <TableCell className="num text-right hidden lg:table-cell">{hours(w.p50HoursToShip)}</TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}

function RatesDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: TargetsSettings["fulfillment"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>RetroShip rate card</DialogTitle>
          <DialogDescription>
            Per-order fees from the RetroShip agreement. Postage is never entered here; it comes from the labels.
            Leave a field blank if it is not charged.
          </DialogDescription>
        </DialogHeader>
        {open ? <RatesForm key={JSON.stringify(initial)} initial={initial} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RatesForm({
  initial,
  onDone,
}: {
  initial: TargetsSettings["fulfillment"];
  onDone: () => void;
}) {
  const [form, setForm] = useState<TargetsSettings["fulfillment"]>(initial);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveFulfillmentRates(form);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Rate card saved");
          onDone();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="pp-order" label="Pick/pack per order" hint="First unit included">
          <MoneyInput id="pp-order" step="0.01" value={form.pick_pack_per_order} onChange={(v) => setForm({ ...form, pick_pack_per_order: v })} placeholder="2.50" />
        </Field>
        <Field id="pp-extra" label="Per additional unit">
          <MoneyInput id="pp-extra" step="0.01" value={form.pick_pack_per_extra_unit} onChange={(v) => setForm({ ...form, pick_pack_per_extra_unit: v })} placeholder="0.50" />
        </Field>
        <Field id="pkg" label="Packaging per order" hint="Mailer, box, dunnage">
          <MoneyInput id="pkg" step="0.01" value={form.packaging_per_order} onChange={(v) => setForm({ ...form, packaging_per_order: v })} placeholder="0.75" />
        </Field>
      </div>
      <Field id="ff-notes" label="Notes">
        <Textarea id="ff-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Rate card effective date, storage fees not included, …" />
      </Field>
      <DialogFooter>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
