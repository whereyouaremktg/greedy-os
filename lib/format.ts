export function formatUsd(
  n: number | null | undefined,
  fractionDigits = 0,
): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  });
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function formatPercent(n: number, fractionDigits = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(fractionDigits)}%`;
}

export function formatDelta(value: number, label?: string): string {
  const sign = value > 0 ? "+" : "";
  const base = `${sign}${value.toFixed(1)}%`;
  return label ? `${base} ${label}` : base;
}

export function formatRelativeTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
