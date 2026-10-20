"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TargetsData } from "@/lib/targets/queries";
import { useCssVars } from "@/components/targets/use-css-vars";
import { count, dayLabel, ratioPct, signedPct, usd, usdCompact } from "@/components/targets/format";

type Metric = "orders" | "net";

const compactNum = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

type ChartRow = TargetsData["bfcm"]["days"][number] & { value: number | null; valueLy: number };

export function BfcmModule({ data }: { data: TargetsData }) {
  const [metric, setMetric] = useState<Metric>("orders");
  const [showTable, setShowTable] = useState(false);
  const vars = useCssVars([
    "--chart-accent",
    "--chart-compare",
    "--border",
    "--muted-foreground",
    "--foreground",
    "--card",
  ] as const);
  const accent = vars["--chart-accent"] || "#d78c42";
  const compare = vars["--chart-compare"] || "#9a948e";
  const grid = vars["--border"] || "#e5e1dc";
  const ink = vars["--muted-foreground"] || "#7a7571";
  const labelInk = vars["--foreground"] || "#1d1b19";
  const surface = vars["--card"] || "#ffffff";

  const bf = data.settings.bfcm;
  const st = data.settings.staffing;
  const m = data.bfcm;
  const year = data.settings.year;

  const rows: ChartRow[] = useMemo(
    () =>
      m.days.map((d) => ({
        ...d,
        value: d.isFuture ? null : metric === "orders" ? d.orders : d.net,
        valueLy: metric === "orders" ? d.ordersLy : d.netLy,
      })),
    [m.days, metric],
  );
  const maxIndex = useMemo(() => {
    let best = -1;
    let bestV = -Infinity;
    rows.forEach((r, i) => {
      if (r.value != null && r.value > bestV) {
        bestV = r.value;
        best = i;
      }
    });
    return best;
  }, [rows]);

  const fmt = (v: number) => (metric === "orders" ? count(v) : usd(v));
  const fmtAxis = (v: number) => (metric === "orders" ? compactNum.format(v) : usdCompact(v));
  const bfcmStarted = data.today >= bf.bf_cm_start;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight">
          BFCM · {dayLabel(bf.start)} – {dayLabel(bf.end)}
        </h2>
        <span className="text-xs text-muted-foreground">
          Each day vs the same weekday last year. BF–CM ({dayLabel(bf.bf_cm_start)}–{dayLabel(bf.bf_cm_end)}) shaded.
        </span>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-2.5 rounded-[3px]" style={{ background: accent }} />
              {year} daily {metric === "orders" ? "orders" : "net sales"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: compare }} />
              Same weekday {year - 1}
            </span>
            {metric === "orders" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: ink }} />
                RetroShip busiest-day tiers
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="net">Net sales</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="sm" onClick={() => setShowTable((s) => !s)}>
              {showTable ? "Chart" : "Table"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showTable ? (
            <BfcmTable data={data} metric={metric} />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={grid} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => dayLabel(d)}
                    tick={{ fontSize: 11, fill: ink }}
                    tickLine={false}
                    axisLine={{ stroke: grid }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: ink }}
                    tickFormatter={fmtAxis}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: ink, fillOpacity: 0.06 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as ChartRow;
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <div className="font-medium">{dayLabel(p.day, { weekday: true })}</div>
                          <div className="mt-1 flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <span className="inline-block h-2.5 w-2 rounded-[2px]" style={{ background: accent }} />
                              {year}
                            </span>
                            <span className="num font-semibold">{p.value == null ? "—" : fmt(p.value)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: compare }} />
                              {dayLabel(p.lyDay, { weekday: true })}
                            </span>
                            <span className="num font-semibold">{fmt(p.valueLy)}</span>
                          </div>
                          {p.isEarlyAccess ? (
                            <div className="mt-1 text-[10px] text-muted-foreground">Early access day</div>
                          ) : null}
                        </div>
                      );
                    }}
                  />
                  <ReferenceArea
                    x1={bf.bf_cm_start}
                    x2={bf.bf_cm_end}
                    fill={accent}
                    fillOpacity={0.08}
                    ifOverflow="hidden"
                  />
                  <ReferenceLine
                    x={bf.early_access}
                    stroke={ink}
                    strokeDasharray="4 4"
                    label={{ value: "Early access", position: "insideTopLeft", fontSize: 10, fill: ink }}
                  />
                  {metric === "orders"
                    ? (
                        [
                          ["Safe", st.busiest_day.safe],
                          ["Baseline", st.busiest_day.baseline],
                          ["Aggressive", st.busiest_day.aggressive],
                        ] as const
                      ).map(([label, y]) => (
                        <ReferenceLine
                          key={label}
                          y={y}
                          stroke={ink}
                          strokeDasharray="4 4"
                          strokeOpacity={0.7}
                          label={{
                            value: `${label} ${count(y)}`,
                            position: "insideTopRight",
                            fontSize: 10,
                            fill: ink,
                          }}
                        />
                      ))
                    : null}
                  <Bar dataKey="value" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                    <LabelList
                      dataKey="value"
                      content={(props) => {
                        const { x, y, width, value, index } = props as {
                          x?: number | string;
                          y?: number | string;
                          width?: number | string;
                          value?: number | string | null;
                          index?: number;
                        };
                        if (index !== maxIndex || value == null || x == null || y == null) return null;
                        return (
                          <text
                            x={Number(x) + Number(width ?? 0) / 2}
                            y={Number(y) - 6}
                            textAnchor="middle"
                            fontSize={11}
                            fontWeight={600}
                            fill={labelInk}
                          >
                            {fmt(Number(value))}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="valueLy"
                    stroke={compare}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: surface }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium text-muted-foreground">BF–CM orders</CardTitle>
            <CardDescription>
              {dayLabel(bf.bf_cm_start)}–{dayLabel(bf.bf_cm_end)} · {m.bfcm.daysElapsed}/{m.bfcm.daysTotal} days in
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="num text-[26px] leading-none font-semibold">
              {bfcmStarted ? count(m.bfcm.orders) : "—"}
            </div>
            <div className="text-xs text-muted-foreground num">
              LY {count(m.bfcm.ordersLy)} orders · {usd(m.bfcm.netLy)}
              {bfcmStarted && m.bfcm.ordersLy > 0
                ? ` · ${signedPct(((m.bfcm.orders - m.bfcm.ordersLy) / m.bfcm.ordersLy) * 100)}`
                : ""}
            </div>
            <StaffingMeter
              value={bfcmStarted ? m.bfcm.orders : null}
              reference={m.bfcm.ordersLy}
              tiers={st.bfcm_orders}
              format={count}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium text-muted-foreground">Busiest day</CardTitle>
            <CardDescription>Peak daily orders in the BFCM window</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="num text-[26px] leading-none font-semibold">
              {m.busiestDay ? count(m.busiestDay.orders) : "—"}
            </div>
            <div className="text-xs text-muted-foreground num">
              {m.busiestDay ? `${dayLabel(m.busiestDay.day, { weekday: true })} · ` : ""}
              LY peak{" "}
              {m.busiestDayLy
                ? `${count(m.busiestDayLy.orders)} on ${dayLabel(m.busiestDayLy.day, { weekday: true })}`
                : "—"}
            </div>
            <StaffingMeter
              value={m.busiestDay?.orders ?? null}
              reference={m.busiestDayLy?.orders ?? null}
              tiers={st.busiest_day}
              format={count}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium text-muted-foreground">Early access day</CardTitle>
            <CardDescription>{dayLabel(m.earlyAccess.day, { weekday: true })} · key date</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="num text-[26px] leading-none font-semibold">
              {data.today >= m.earlyAccess.day ? count(m.earlyAccess.orders) : "—"}
              <span className="ml-1 text-sm font-normal text-muted-foreground">orders</span>
            </div>
            <div className="text-xs text-muted-foreground num">
              {data.today >= m.earlyAccess.day ? `${usd(m.earlyAccess.net)} net · ` : ""}
              LY {dayLabel(m.earlyAccess.lyDay, { weekday: true })}: {count(m.earlyAccess.ordersLy)} orders,{" "}
              {usd(m.earlyAccess.netLy)}
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium text-muted-foreground">Fulfillment SLA</CardTitle>
            <CardDescription>
              BF–CM orders shipped by {dayLabel(m.sla.deadline)} (ShipHero, via Shopify fulfillments)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="num text-[26px] leading-none font-semibold">
              {m.sla.total > 0 ? ratioPct(m.sla.pct, 0) : "—"}
            </div>
            <div className="text-xs text-muted-foreground num">
              {m.sla.total > 0
                ? `${count(m.sla.shipped)} of ${count(m.sla.total)} orders · `
                : "Starts with Black Friday · "}
              LY{" "}
              {m.sla.ly.total > 0
                ? `${ratioPct(m.sla.ly.pct, 0)} (${count(m.sla.ly.shipped)}/${count(m.sla.ly.total)})`
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function StaffingMeter({
  value,
  reference,
  tiers,
  format,
}: {
  value: number | null;
  reference: number | null;
  tiers: { safe: number; baseline: number; aggressive: number };
  format: (n: number) => string;
}) {
  const max = Math.max(tiers.aggressive, value ?? 0, reference ?? 0) * 1.1;
  const pos = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const ticks = [
    ["Safe", tiers.safe],
    ["Baseline", tiers.baseline],
    ["Aggressive", tiers.aggressive],
  ] as const;
  return (
    <div className="pt-1 pb-5">
      <div className="relative h-2 w-full rounded-full bg-muted">
        {value != null ? (
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: pos(value) }} />
        ) : null}
        {reference != null ? (
          <div
            className="absolute -top-0.5 h-3 w-0.5 rounded bg-muted-foreground"
            style={{ left: pos(reference) }}
            title={`Last year ${format(reference)}`}
          />
        ) : null}
        {ticks.map(([label, n]) => (
          <div key={label} className="absolute -top-1 h-4 w-px bg-foreground/50" style={{ left: pos(n) }}>
            <span className="absolute top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground num">
              {label} {format(n)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BfcmTable({ data, metric }: { data: TargetsData; metric: Metric }) {
  const fmt = (v: number) => (metric === "orders" ? count(v) : usd(v));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          <TableHead className="text-right">{data.settings.year}</TableHead>
          <TableHead className="text-right">Same weekday {data.settings.year - 1}</TableHead>
          <TableHead className="text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.bfcm.days.map((d) => {
          const v = metric === "orders" ? d.orders : d.net;
          const ly = metric === "orders" ? d.ordersLy : d.netLy;
          const delta = !d.isFuture && ly > 0 ? ((v - ly) / ly) * 100 : null;
          return (
            <TableRow key={d.day} className={cn(d.isBfCm && "bg-brand/5", d.isFuture && "text-muted-foreground")}>
              <TableCell className="font-medium">
                {dayLabel(d.day, { weekday: true })}
                {d.isEarlyAccess ? (
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">early access</span>
                ) : null}
                {d.isBfCm ? <span className="ml-2 text-[10px] uppercase text-muted-foreground">BF–CM</span> : null}
              </TableCell>
              <TableCell className="num text-right">{d.isFuture ? "—" : fmt(v)}</TableCell>
              <TableCell className="num text-right text-muted-foreground">
                {fmt(ly)} <span className="text-[10px]">({dayLabel(d.lyDay)})</span>
              </TableCell>
              <TableCell
                className={cn(
                  "num text-right",
                  delta == null ? "text-muted-foreground" : delta >= 0 ? "text-success" : "text-danger",
                )}
              >
                {signedPct(delta, 0)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
