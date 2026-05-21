"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

type Format = "usd" | "number" | "percent";

type Props = {
  value: number | null | undefined;
  format?: Format;
  fractionDigits?: number;
  className?: string;
};

function formatOptions(format: Format, fractionDigits: number) {
  switch (format) {
    case "usd":
      return {
        style: "currency" as const,
        currency: "USD",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      };
    case "percent":
      return {
        style: "percent" as const,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      };
    default:
      return {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      };
  }
}

export function AnimatedValue({
  value,
  format = "number",
  fractionDigits = 0,
  className,
}: Props) {
  if (value == null) {
    return <span className={cn("num", className)}>—</span>;
  }

  const display = format === "percent" ? value / 100 : value;

  return (
    <NumberFlow
      className={cn("num", className)}
      value={display}
      format={formatOptions(format, fractionDigits)}
      willChange
    />
  );
}
