import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { qboFetch } from "@/lib/quickbooks/client";

// QuickBooks puller — pulls a 30-day window into qb_financials +
// qb_revenue_by_channel.
//
// Reports we use (all "Reports" REST endpoints under /v3/company/{realmId}):
//   - BalanceSheet                     (today only) → cash_position
//   - AgedReceivableDetail             (today only) → AR aging buckets
//   - AgedPayableDetail                (today only) → ap_total + ap_due_30
//   - ProfitAndLoss                    (per day, 30) → revenue/cogs/exp/ni
//   - ProfitAndLoss?summarize_column_by=Class  (per day, 30) → revenue split
//                                                              by class →
//                                                              DTC / wholesale
//
// QBO reports return a JSON Header/Columns/Rows tree. Row sections nest
// recursively; each section has a Summary row whose last "Amount" cell is the
// section's total. Top-level Summary at the bottom gives the report total.
//
// Locale note: section/summary labels in the report payload are localized to
// the company's QBO settings. We match on US English labels (the canonical
// strings Intuit ships). If the company is non-en-US the puller will return
// nulls for the missing rows — fix by extending LABEL_MATCHERS or by setting
// the report's `query` to force en-US (not exposed today).
//
// Concurrency: P&L calls are throttled to MAX_CONCURRENT to stay polite with
// Intuit's per-realm rate limits (default 500 req/min, but bursts of 30 over
// ~1s often trigger 429s in practice).

const WINDOW_DAYS = 30;
const MAX_CONCURRENT_PNL = 10;

// QBO Reports JSON types — only the fields we touch.
type ColData = { value?: string };
type Row = {
  type?: "Section" | "Data";
  group?: string;
  Header?: { ColData?: ColData[] };
  Summary?: { ColData?: ColData[] };
  ColData?: ColData[];
  Rows?: { Row?: Row[] };
};

type Report = {
  Header?: unknown;
  Columns?: { Column?: { ColTitle?: string; ColType?: string }[] };
  Rows?: { Row?: Row[] };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseAmount(v: string | undefined): number {
  if (!v) return 0;
  // QBO returns amounts as strings, sometimes with commas / parentheses for
  // negatives in formatted reports. The raw JSON usually returns plain
  // decimals ("1234.56") but defensive cleanup is cheap.
  const cleaned = v.replace(/,/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function lastAmount(colData?: ColData[]): number {
  if (!colData) return 0;
  for (let i = colData.length - 1; i >= 0; i--) {
    const v = colData[i]?.value;
    if (v && /-?\d/.test(v)) return parseAmount(v);
  }
  return 0;
}

function rowLabel(row: Row): string {
  return (
    row.Header?.ColData?.[0]?.value?.trim() ??
    row.Summary?.ColData?.[0]?.value?.trim() ??
    row.ColData?.[0]?.value?.trim() ??
    row.group?.trim() ??
    ""
  );
}

// Walk every row (including nested), yielding flat (label, summaryAmount)
// tuples. Useful for finding any row whose label matches.
function* walkRows(rows: Row[] | undefined): Generator<Row> {
  for (const row of rows ?? []) {
    yield row;
    if (row.Rows?.Row) yield* walkRows(row.Rows.Row);
  }
}

function findSummaryAmount(
  report: Report,
  predicate: (label: string) => boolean,
): number | null {
  for (const row of walkRows(report.Rows?.Row)) {
    const label = rowLabel(row).toLowerCase();
    if (label && predicate(label) && row.Summary?.ColData) {
      return round2(lastAmount(row.Summary.ColData));
    }
  }
  return null;
}

// Today's date in YYYY-MM-DD (UTC). qb_financials.as_of_date is a Postgres
// date; QBO's date_macro=Today uses the realm's timezone which we accept as
// "close enough" for daily aggregates.
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDates(n: number): string[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    return isoDate(d);
  });
}

// ----- BalanceSheet → cash_position -----
async function fetchCashPosition(): Promise<number | null> {
  const report = await qboFetch<Report>(
    "/reports/BalanceSheet?date_macro=Today",
  );
  // QBO labels the cash subtotal as "Bank Accounts" (en-US). Also check
  // common synonyms in case the report layout differs.
  const matchers = [
    "bank accounts",
    "total bank accounts",
    "cash and cash equivalents",
  ];
  for (const m of matchers) {
    const v = findSummaryAmount(report, (l) => l === m);
    if (v != null) return v;
  }
  // Fallback: any section/summary row containing "bank".
  return findSummaryAmount(report, (l) => l.includes("bank"));
}

// ----- AgedReceivableDetail → AR aging buckets -----
type ArAging = {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  over90: number;
  total: number;
};

// Map a section label (lowercased) to one of our bucket keys.
function arAgingBucketFromLabel(label: string): keyof ArAging | null {
  const l = label.toLowerCase();
  if (l === "current" || l === "total current") return "current";
  if (/(^|[^\d])1\s*[-–to]+\s*30/.test(l)) return "d30";
  if (/(^|[^\d])31\s*[-–to]+\s*60/.test(l)) return "d60";
  if (/(^|[^\d])61\s*[-–to]+\s*90/.test(l)) return "d90";
  if (/91\s*(?:and\s*over|\+|or\s*more)/.test(l) || /(>|over)\s*90/.test(l))
    return "over90";
  return null;
}

async function fetchArAging(): Promise<ArAging> {
  const report = await qboFetch<Report>(
    "/reports/AgedReceivableDetail?date_macro=Today",
  );

  const buckets: ArAging = {
    current: 0,
    d30: 0,
    d60: 0,
    d90: 0,
    over90: 0,
    total: 0,
  };

  for (const section of report.Rows?.Row ?? []) {
    if (section.type !== "Section" && !section.Header) continue;
    const label = rowLabel(section);
    const bucket = arAgingBucketFromLabel(label);
    if (!bucket) continue;
    const amount = round2(lastAmount(section.Summary?.ColData));
    buckets[bucket] = amount;
  }

  buckets.total = round2(
    buckets.current + buckets.d30 + buckets.d60 + buckets.d90 + buckets.over90,
  );
  return buckets;
}

// ----- AgedPayableDetail → ap_total + ap_due_30 -----
async function fetchApAging(): Promise<{ total: number; due30: number }> {
  const report = await qboFetch<Report>(
    "/reports/AgedPayableDetail?date_macro=Today",
  );

  let current = 0;
  let d30 = 0;
  let total = 0;

  for (const section of report.Rows?.Row ?? []) {
    if (section.type !== "Section" && !section.Header) continue;
    const label = rowLabel(section).toLowerCase();
    const amount = round2(lastAmount(section.Summary?.ColData));
    if (label === "current" || label === "total current") {
      current = amount;
      total += amount;
    } else if (/(^|[^\d])1\s*[-–to]+\s*30/.test(label)) {
      d30 = amount;
      total += amount;
    } else if (
      /(^|[^\d])\d+\s*[-–to]+\s*\d+/.test(label) ||
      /91\s*(?:and\s*over|\+|or\s*more)/.test(label) ||
      /(>|over)\s*90/.test(label)
    ) {
      total += amount;
    }
  }

  return { total: round2(total), due30: round2(current + d30) };
}

// ----- ProfitAndLoss by Class → channel revenue split -----
//
// Heuristic mapping QBO Class names → (dtc | wholesale | other). QBO classes
// are free-text so we keyword-match on the lowercased name. If a company
// uses non-obvious class names, edit CHANNEL_KEYWORDS below or extend this
// puller to consult a stored mapping in connector_credentials.
const CHANNEL_KEYWORDS: { dtc: RegExp; wholesale: RegExp } = {
  dtc: /(dtc|shopify|d2c|direct|retail|website|online|ecom|e-?commerce|amazon)/i,
  wholesale: /(wholesale|whlsl|b2b|distributor|reseller|trade|key\s?account)/i,
};

export function classifyClassName(name: string): "dtc" | "wholesale" | "other" {
  const trimmed = name.trim();
  if (CHANNEL_KEYWORDS.wholesale.test(trimmed)) return "wholesale";
  if (CHANNEL_KEYWORDS.dtc.test(trimmed)) return "dtc";
  return "other";
}

type ChannelDay = {
  dtc: number;
  wholesale: number;
  other: number;
  classes: Record<string, number>;
};

// QBO ProfitAndLoss with summarize_column_by=Class returns one column per
// class plus a TOTAL column. We pull the "Total Income" summary row and
// distribute each column's amount into a channel bucket using the column
// title (class name) as the key.
async function fetchRevenueByClassForDay(date: string): Promise<ChannelDay> {
  const report = await qboFetch<Report>(
    `/reports/ProfitAndLoss?start_date=${date}&end_date=${date}&summarize_column_by=Class`,
  );

  const columns = report.Columns?.Column ?? [];
  // Find the "Total Income" section's Summary row across all class columns.
  let summaryRow: Row | undefined;
  for (const row of walkRows(report.Rows?.Row)) {
    const label = rowLabel(row).toLowerCase();
    if ((label === "total income" || label === "income") && row.Summary?.ColData) {
      summaryRow = row;
      break;
    }
  }

  const result: ChannelDay = {
    dtc: 0,
    wholesale: 0,
    other: 0,
    classes: {},
  };

  if (!summaryRow?.Summary?.ColData) return result;

  const cells = summaryRow.Summary.ColData;
  // QBO column 0 is the row label; columns 1..n-1 are class columns; the
  // last column is the row total (we skip it to avoid double-counting).
  for (let i = 1; i < columns.length && i < cells.length; i++) {
    const col = columns[i];
    const title = col?.ColTitle?.trim() ?? "";
    if (!title) continue;
    // Skip the trailing "TOTAL" column if QBO included it.
    if (title.toLowerCase() === "total" && i === columns.length - 1) continue;

    const amount = round2(parseAmount(cells[i]?.value));
    if (!Number.isFinite(amount) || amount === 0) {
      // Still record zero classes so the audit blob is complete.
      result.classes[title] = 0;
      continue;
    }

    result.classes[title] = amount;
    const bucket = classifyClassName(title);
    result[bucket] += amount;
  }

  result.dtc = round2(result.dtc);
  result.wholesale = round2(result.wholesale);
  result.other = round2(result.other);
  return result;
}

// ----- ProfitAndLoss (per day) -----
type PnlRow = {
  revenue: number;
  cogs: number;
  expenses: number;
  net_income: number;
};

async function fetchPnlForDay(date: string): Promise<PnlRow> {
  const report = await qboFetch<Report>(
    `/reports/ProfitAndLoss?start_date=${date}&end_date=${date}`,
  );

  const revenue =
    findSummaryAmount(report, (l) => l === "total income") ?? 0;
  const cogs =
    findSummaryAmount(
      report,
      (l) => l === "total cost of goods sold" || l === "total cogs",
    ) ?? 0;
  const expenses =
    findSummaryAmount(report, (l) => l === "total expenses") ?? 0;
  // Net income comes from a top-level Summary row labeled "Net Income".
  const netIncome =
    findSummaryAmount(report, (l) => l === "net income") ??
    round2(revenue - cogs - expenses);

  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    expenses: round2(expenses),
    net_income: round2(netIncome),
  };
}

// Tiny concurrency limiter — keeps no more than `max` in-flight, preserves
// input order in the output array.
async function pMap<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  max: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(max, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

type QbRow = {
  as_of_date: string;
  cash_position: number | null;
  ar_total: number | null;
  ar_aging_current: number | null;
  ar_aging_30: number | null;
  ar_aging_60: number | null;
  ar_aging_90: number | null;
  ar_aging_over_90: number | null;
  ap_total: number | null;
  ap_due_30: number | null;
  revenue: number;
  cogs: number;
  expenses: number;
  net_income: number;
  synced_at: string;
};

export async function runQuickbooksPull(): Promise<{
  ok: true;
  rows: number;
  notes: string[];
}> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const notes: string[] = [];

  // Today's BalanceSheet / aging snapshots happen once. P&L runs per day.
  const [cashPosition, ar, ap] = await Promise.all([
    fetchCashPosition().catch((err: unknown) => {
      notes.push(`BalanceSheet failed: ${(err as Error).message}`);
      return null;
    }),
    fetchArAging().catch((err: unknown) => {
      notes.push(`AgedReceivableDetail failed: ${(err as Error).message}`);
      return null;
    }),
    fetchApAging().catch((err: unknown) => {
      notes.push(`AgedPayableDetail failed: ${(err as Error).message}`);
      return null;
    }),
  ]);

  if (cashPosition == null) {
    notes.push(
      "cash_position null — no Bank Accounts subtotal found on BalanceSheet (locale or chart-of-accounts mismatch).",
    );
  }

  const dates = lastNDates(WINDOW_DAYS);
  const todayIso = dates[0];

  const pnlByDate = new Map<string, PnlRow>();
  const channelByDate = new Map<string, ChannelDay>();
  let channelFailures = 0;
  await pMap(
    dates,
    async (date) => {
      const [pnl, channels] = await Promise.all([
        fetchPnlForDay(date),
        fetchRevenueByClassForDay(date).catch((err: unknown) => {
          channelFailures++;
          notes.push(
            `P&L by Class failed for ${date}: ${(err as Error).message}`,
          );
          return null;
        }),
      ]);
      pnlByDate.set(date, pnl);
      if (channels) channelByDate.set(date, channels);
    },
    MAX_CONCURRENT_PNL,
  );

  const rows: QbRow[] = dates.map((as_of_date) => {
    const pnl = pnlByDate.get(as_of_date) ?? {
      revenue: 0,
      cogs: 0,
      expenses: 0,
      net_income: 0,
    };
    const isToday = as_of_date === todayIso;
    return {
      as_of_date,
      cash_position: isToday ? cashPosition : null,
      ar_total: isToday && ar ? ar.total : null,
      ar_aging_current: isToday && ar ? ar.current : null,
      ar_aging_30: isToday && ar ? ar.d30 : null,
      ar_aging_60: isToday && ar ? ar.d60 : null,
      ar_aging_90: isToday && ar ? ar.d90 : null,
      ar_aging_over_90: isToday && ar ? ar.over90 : null,
      ap_total: isToday && ap ? ap.total : null,
      ap_due_30: isToday && ap ? ap.due30 : null,
      revenue: pnl.revenue,
      cogs: pnl.cogs,
      expenses: pnl.expenses,
      net_income: pnl.net_income,
      synced_at: now,
    };
  });

  notes.push(
    "Historical cash_position / AR / AP intentionally null — QBO BalanceSheet and aging reports have no per-day historical endpoint, only as-of-today.",
  );

  const { error } = await supabase
    .from("qb_financials")
    .upsert(rows, { onConflict: "as_of_date" });

  if (error) throw new Error(`qb_financials upsert: ${error.message}`);

  // qb_revenue_by_channel — only upsert dates where the by-class fetch
  // succeeded. Missing rows surface as nulls / empty state in the UI.
  if (channelByDate.size > 0) {
    const channelRows = [...channelByDate.entries()].map(
      ([as_of_date, c]) => ({
        as_of_date,
        dtc_revenue: c.dtc,
        wholesale_revenue: c.wholesale,
        other_revenue: c.other,
        total_revenue: round2(c.dtc + c.wholesale + c.other),
        classes: c.classes,
        synced_at: now,
      }),
    );

    const { error: channelError } = await supabase
      .from("qb_revenue_by_channel")
      .upsert(channelRows, { onConflict: "as_of_date" });

    if (channelError) {
      notes.push(`qb_revenue_by_channel upsert: ${channelError.message}`);
    }
  } else {
    notes.push(
      "qb_revenue_by_channel skipped — no per-class days fetched (check that QBO Class tracking is enabled and classes are named with DTC/wholesale keywords).",
    );
  }

  if (channelFailures > 0) {
    notes.push(
      `${channelFailures}/${dates.length} P&L-by-Class days failed; channel split may be incomplete.`,
    );
  }

  return { ok: true, rows: rows.length, notes };
}
