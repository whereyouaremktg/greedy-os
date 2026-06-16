"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Minus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCount, formatPercent } from "@/lib/format";
import { StatusBadge } from "@/components/inventory/status-badge";
import type { ForecastStatus, SkuForecast } from "@/lib/inventory/forecast";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function MonthsOfCover({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    value < 1 ? "text-danger" : value < 2 ? "text-warning" : "text-foreground";
  return <span className={tone}>{value.toFixed(1)}</span>;
}

function YoyGrowth({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const pct = value * 100;
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        pct > 0 && "text-success",
        pct < 0 && "text-danger",
        pct === 0 && "text-muted-foreground",
      )}
    >
      <Icon className="size-3" />
      {formatPercent(pct, 0)}
    </span>
  );
}

// Urgency ordering for the Status column sort.
const STATUS_RANK: Record<ForecastStatus, number> = {
  order_now: 0,
  order_soon: 1,
  watch: 2,
  comfortable: 3,
  demand_down: 4,
  insufficient_data: 5,
};

type SortKey =
  | "product"
  | "onHand"
  | "incoming"
  | "cover"
  | "yoy"
  | "status"
  | "stockout"
  | "orderBy"
  | "reorder";

type SortDir = "asc" | "desc";

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  return a - b;
}

function compareNullableDate(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function SortHeader({
  label,
  sortKey,
  active,
  dir,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onSort: (key: SortKey) => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] uppercase tracking-wide hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        align === "right" && "ml-auto flex-row-reverse",
      )}
    >
      {label}
      <Icon className="size-3 opacity-60" />
    </button>
  );
}

export function ForecastTable({ forecasts }: { forecasts: SkuForecast[] }) {
  const [query, setQuery] = React.useState("");
  const [inStockOnly, setInStockOnly] = React.useState(false);
  // null = preserve the server's urgency-first ordering.
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric/recency columns are most useful highest-first by default.
      setSortDir(
        key === "product" || key === "status" || key === "stockout"
          ? "asc"
          : "desc",
      );
    }
  }

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = forecasts.filter((f) => {
      if (inStockOnly && f.onHand <= 0) return false;
      if (!q) return true;
      return (
        f.sku.toLowerCase().includes(q) ||
        f.productTitle.toLowerCase().includes(q)
      );
    });

    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        switch (sortKey) {
          case "product":
            return a.productTitle.localeCompare(b.productTitle) * dir;
          case "onHand":
            return (a.onHand - b.onHand) * dir;
          case "incoming":
            return (a.incomingUnits - b.incomingUnits) * dir;
          case "cover":
            return compareNullableNumber(a.monthsOfCover, b.monthsOfCover) * dir;
          case "yoy":
            return compareNullableNumber(a.yoyGrowth, b.yoyGrowth) * dir;
          case "status":
            return (STATUS_RANK[a.status] - STATUS_RANK[b.status]) * dir;
          case "stockout":
            return compareNullableDate(a.stockoutDate, b.stockoutDate) * dir;
          case "orderBy":
            return compareNullableDate(a.orderByDate, b.orderByDate) * dir;
          case "reorder":
            return (a.reorderQty - b.reorderQty) * dir;
          default:
            return 0;
        }
      });
    }
    return list;
  }, [forecasts, query, inStockOnly, sortKey, sortDir]);

  if (forecasts.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No SKUs to forecast yet. Demand history and on-hand will appear here once
        synced.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search SKU or product…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search inventory"
          />
        </InputGroup>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <Switch
              checked={inStockOnly}
              onCheckedChange={setInStockOnly}
              aria-label="In stock only"
            />
            In stock only
          </label>
          <span className="num tabular-nums">
            {rows.length} of {forecasts.length}
          </span>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="px-4 py-2.5">
                  <SortHeader
                    label="SKU / Product"
                    sortKey="product"
                    active={sortKey === "product"}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortHeader
                    label="On hand"
                    sortKey="onHand"
                    active={sortKey === "onHand"}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortHeader
                    label="Incoming"
                    sortKey="incoming"
                    active={sortKey === "incoming"}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortHeader
                    label="Cover (mo)"
                    sortKey="cover"
                    active={sortKey === "cover"}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5 text-right">
                  <SortHeader
                    label="YoY"
                    sortKey="yoy"
                    active={sortKey === "yoy"}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5">
                  <SortHeader
                    label="Status"
                    sortKey="status"
                    active={sortKey === "status"}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5">
                  <SortHeader
                    label="Stockout"
                    sortKey="stockout"
                    active={sortKey === "stockout"}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-3 py-2.5">
                  <SortHeader
                    label="Order by"
                    sortKey="orderBy"
                    active={sortKey === "orderBy"}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="px-4 py-2.5 text-right">
                  <SortHeader
                    label="Reorder"
                    sortKey="reorder"
                    active={sortKey === "reorder"}
                    dir={sortDir}
                    align="right"
                    onSort={handleSort}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No SKUs match “{query}”.
                  </td>
                </tr>
              ) : (
                rows.map((f) => (
                  <tr
                    key={f.sku}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium leading-tight">
                        {f.productTitle}
                      </div>
                      <div className="text-[11px] text-muted-foreground num">
                        {f.sku}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right num">
                      {formatCount(f.onHand)}
                    </td>
                    <td className="px-3 py-2.5 text-right num text-muted-foreground">
                      {f.incomingUnits > 0 ? formatCount(f.incomingUnits) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right num">
                      <MonthsOfCover value={f.monthsOfCover} />
                    </td>
                    <td className="px-3 py-2.5 text-right num">
                      <YoyGrowth value={f.yoyGrowth} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-3 py-2.5 num text-muted-foreground whitespace-nowrap">
                      {formatDate(f.stockoutDate)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 num whitespace-nowrap",
                        f.status === "order_now"
                          ? "text-danger font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatDate(f.orderByDate)}
                    </td>
                    <td className="px-4 py-2.5 text-right num font-medium">
                      {f.reorderQty > 0 ? formatCount(f.reorderQty) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
