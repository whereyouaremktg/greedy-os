"use client";

import { KpiTile } from "@/components/dashboard/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Compared, TargetsData } from "@/lib/targets/queries";
import { count, ratioPct, signedPct, usd } from "@/components/targets/format";

const STALE_MS = 8 * 60 * 60 * 1000;

function yoy(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  );
}

export function DtcSection({ data }: { data: TargetsData }) {
  const d = data.revenue.dtc;
  const flagMax = data.settings.flags.discount_rate_max_pct / 100;
  const discountFlagged = (d.current.discountRate ?? 0) > flagMax;
  const syncedAt = data.sync.dataAsOf;
  const aovYoy = yoy(d.current.aov, d.lastYear.aov);

  return (
    <section className="space-y-3">
      <SectionHeading
        title="DTC · Shopify Online Store"
        note="Paid orders only. Draft Orders, ShopMy, LTK, Shopify Mobile, gifting and 100%-discounted orders are excluded."
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Net sales"
          rawValue={d.current.netSales}
          format="usd"
          delta={d.yoyNet != null ? { value: d.yoyNet, label: "vs LY to date" } : undefined}
          sub={`LY to date ${usd(d.lastYear.netSales)} · LY Q4 ${usd(d.lastYearFull.netSales)}`}
          syncedAt={syncedAt}
          staleAfterMs={STALE_MS}
        />
        <KpiTile
          title="Orders"
          rawValue={d.current.orders}
          format="number"
          delta={d.yoyOrders != null ? { value: d.yoyOrders, label: "vs LY to date" } : undefined}
          sub={`LY to date ${count(d.lastYear.orders)}`}
          syncedAt={syncedAt}
          staleAfterMs={STALE_MS}
        />
        <KpiTile
          title="AOV"
          rawValue={d.current.aov}
          format="usd"
          fractionDigits={2}
          delta={aovYoy != null ? { value: aovYoy, label: "vs LY to date" } : undefined}
          sub={d.lastYear.aov != null ? `LY to date ${usd(d.lastYear.aov)}` : undefined}
          syncedAt={syncedAt}
          staleAfterMs={STALE_MS}
        />
        <KpiTile
          title="Discount rate"
          value={ratioPct(d.current.discountRate)}
          status={discountFlagged ? "stale" : "live"}
          sub={`LY to date ${ratioPct(d.lastYear.discountRate)} · flag above ${data.settings.flags.discount_rate_max_pct}%`}
          hint={discountFlagged ? "Above the discount guardrail for paid orders" : undefined}
        />
      </div>
    </section>
  );
}

function ComparedRow({ label, c }: { label: string; c: Compared }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="num text-right">{usd(c.current.netSales)}</TableCell>
      <TableCell className="num text-right">{count(c.current.orders)}</TableCell>
      <TableCell className="num text-right hidden sm:table-cell">
        {c.current.aov != null ? usd(c.current.aov) : "—"}
      </TableCell>
      <TableCell className="num text-right">
        <span
          className={cn(
            c.yoyNet == null ? "text-muted-foreground" : c.yoyNet >= 0 ? "text-success" : "text-danger",
          )}
        >
          {signedPct(c.yoyNet)}
        </span>
        <div className="text-[10px] text-muted-foreground">LY {usd(c.lastYear.netSales)}</div>
      </TableCell>
    </TableRow>
  );
}

export function MarketplacesSection({ data }: { data: TargetsData }) {
  const r = data.revenue;
  return (
    <section className="space-y-3">
      <SectionHeading title="Marketplaces" note="Revenue and orders per channel, paid orders only." />
      <Card size="sm" className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Net sales</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right hidden sm:table-cell">AOV</TableHead>
              <TableHead className="text-right">vs LY to date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.marketplaces.map((m) => (
              <ComparedRow key={m.bucket} label={m.label} c={m} />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">All marketplaces</TableCell>
              <TableCell className="num text-right font-semibold">
                {usd(r.marketplacesTotal.current.netSales)}
              </TableCell>
              <TableCell className="num text-right font-semibold">
                {count(r.marketplacesTotal.current.orders)}
              </TableCell>
              <TableCell className="num text-right hidden sm:table-cell">
                {r.marketplacesTotal.current.aov != null ? usd(r.marketplacesTotal.current.aov) : "—"}
              </TableCell>
              <TableCell className="num text-right">{signedPct(r.marketplacesTotal.yoyNet)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
    </section>
  );
}

export function B2bSection({ data }: { data: TargetsData }) {
  const b = data.revenue.b2b;
  const counted = data.settings.count_b2b_in_total;
  return (
    <section className="space-y-3">
      <SectionHeading
        title="B2B · Shopify"
        note={`Orders tagged B2B (salons, small accounts). ${counted ? "Counted in the Q4 total." : "Not counted in the Q4 total."}`}
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="B2B net sales"
          rawValue={b.current.netSales}
          format="usd"
          delta={b.yoyNet != null ? { value: b.yoyNet, label: "vs LY to date" } : undefined}
          sub={`LY to date ${usd(b.lastYear.netSales)}`}
        />
        <KpiTile
          title="B2B orders"
          rawValue={b.current.orders}
          format="number"
          delta={b.yoyOrders != null ? { value: b.yoyOrders, label: "vs LY to date" } : undefined}
          sub={`AOV ${b.current.aov != null ? usd(b.current.aov) : "—"}`}
        />
      </div>
    </section>
  );
}

export function MarketingLine({ data }: { data: TargetsData }) {
  const r = data.revenue;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Not revenue</CardTitle>
        <CardDescription>
          Seeding, gifting and excluded channels, tracked as marketing so nothing hides.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Seeding &amp; gifting</dt>
            <dd className="mt-1 num text-lg font-semibold">{count(r.seeding.units)} units</dd>
            <dd className="text-xs text-muted-foreground num">
              {usd(r.seeding.retailValue)} retail value · {count(r.seeding.orders)} orders · LY to date{" "}
              {count(r.seeding.ly.units)} units
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Excluded channels, paid</dt>
            <dd className="mt-1 num text-lg font-semibold">{usd(r.excludedChannels.net)}</dd>
            <dd className="text-xs text-muted-foreground num">
              {count(r.excludedChannels.orders)} orders via Draft Orders, ShopMy, LTK or Shopify Mobile
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Unpaid or pending</dt>
            <dd className="mt-1 num text-lg font-semibold">{count(r.unpaid.orders)} orders</dd>
            <dd className="text-xs text-muted-foreground num">{usd(r.unpaid.total)} not yet counted</dd>
          </div>
        </dl>
        {r.otherChannels.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Other storefronts counted as DTC:</span>
            {r.otherChannels.map((c) => (
              <Badge key={c.channel} variant="outline" className="num">
                {c.channel} · {usd(c.net)} · {count(c.orders)}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
