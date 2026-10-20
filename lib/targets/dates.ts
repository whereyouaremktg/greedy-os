// Store-local calendar helpers. Shopify Analytics buckets by the shop's IANA
// timezone (Greedy: America/Phoenix, no DST), so the dashboard does too. The
// existing shopify_metrics puller buckets by UTC day — that is why this module
// does not reuse it.

export const STORE_TZ = "America/Phoenix";

const dayFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = dayFormatter.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatter.set(tz, f);
  }
  return f;
}

/** YYYY-MM-DD of an instant in the store timezone. */
export function localDay(iso: string | Date, tz: string = STORE_TZ): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // en-CA yields YYYY-MM-DD.
  return formatterFor(tz).format(d);
}

/** Add n calendar days to a YYYY-MM-DD string (UTC arithmetic on the date). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a), both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const ms =
    Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Inclusive list of days from start to end. */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday ... 6 = Saturday for a YYYY-MM-DD string. */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The same weekday one year earlier: 52 weeks (364 days) back. */
export function sameWeekdayLastYear(day: string): string {
  return addDays(day, -364);
}

/**
 * The UTC instant at which a store-local calendar day begins. Resolved by
 * probing the formatter — correct for zones with or without DST and needs no
 * tz database beyond Intl.
 */
export function startOfLocalDayUtc(day: string, tz: string = STORE_TZ): Date {
  // Start from the UTC midnight and shift until the local day matches.
  let guess = new Date(`${day}T00:00:00Z`);
  for (let i = 0; i < 3; i++) {
    const local = localDay(guess, tz);
    if (local === day) {
      // Walk back hour by hour while still the same local day.
      let probe = new Date(guess.getTime() - 3_600_000);
      while (localDay(probe, tz) === day) {
        guess = probe;
        probe = new Date(guess.getTime() - 3_600_000);
      }
      // Now `guess` is within the first hour of the local day; snap to the
      // minute boundary by scanning minutes (zones are minute-aligned).
      probe = new Date(guess.getTime() - 60_000);
      while (localDay(probe, tz) === day) {
        guess = probe;
        probe = new Date(guess.getTime() - 60_000);
      }
      return guess;
    }
    // Local day is earlier or later than wanted: jump a day and retry.
    guess = new Date(guess.getTime() + (local < day ? 1 : -1) * 86_400_000);
  }
  return guess;
}

export type QuarterWindow = {
  /** First local day, inclusive. */
  start: string;
  /** Last local day, inclusive. */
  end: string;
  /** UTC instants for Shopify `created_at` filters: [startUtc, endUtcExclusive). */
  startUtc: string;
  endUtcExclusive: string;
};

export function q4Window(year: number, tz: string = STORE_TZ): QuarterWindow {
  const start = `${year}-10-01`;
  const end = `${year}-12-31`;
  return {
    start,
    end,
    startUtc: startOfLocalDayUtc(start, tz).toISOString(),
    endUtcExclusive: startOfLocalDayUtc(`${year + 1}-01-01`, tz).toISOString(),
  };
}

/** Today's date in the store timezone. */
export function todayLocal(tz: string = STORE_TZ, now: Date = new Date()): string {
  return localDay(now, tz);
}
