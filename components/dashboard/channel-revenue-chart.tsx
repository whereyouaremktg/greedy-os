"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  dtc: number;
  wholesale: number;
};

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ChannelRevenueChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No channel data yet.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="dtcGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="wholesaleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.5} />
              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDayLabel}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => usdCompact.format(v)}
            width={56}
          />
          <Tooltip
            formatter={(value, name) => [
              usdFull.format(Number(value)),
              name === "dtc" ? "DTC" : "Wholesale",
            ]}
            labelFormatter={(label) => formatDayLabel(String(label))}
            contentStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="wholesale"
            stackId="rev"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#wholesaleGradient)"
          />
          <Area
            type="monotone"
            dataKey="dtc"
            stackId="rev"
            stroke="var(--brand)"
            strokeWidth={2}
            fill="url(#dtcGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
