// Display helpers local to the targets dashboard.

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function usdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return compactUsd.format(n);
}

export function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return fullUsd.format(n);
}

export function count(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/** Unsigned percentage from a 0..1 ratio, e.g. 0.123 → "12.3%". */
export function ratioPct(r: number | null | undefined, digits = 1): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(digits)}%`;
}

/** Signed percentage from a percent number, e.g. 12.3 → "+12.3%". */
export function signedPct(p: number | null | undefined, digits = 1): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(digits)}%`;
}

export function dayLabel(day: string, opts: { weekday?: boolean } = {}): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: opts.weekday ? "short" : undefined,
    timeZone: "UTC",
  });
}

export function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Phoenix",
  });
}
