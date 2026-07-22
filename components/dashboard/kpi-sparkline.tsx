"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";

type Props = {
  data: number[];
  className?: string;
};

export function KpiSparkline({ data, className }: Props) {
  if (data.length < 2) return null;

  const chartData = data.map((value, i) => ({ i, value }));
  const stroke = "var(--brand)";
  const gradientId = `kpi-spark-${data.length}-${data[0]}`;

  return (
    <div className={className ?? "h-16 w-full mt-3 -mx-1"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
