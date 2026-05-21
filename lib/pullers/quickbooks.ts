import { createServiceClient } from "@/lib/supabase/service";
import { lastNDates, seedNumber } from "./_mock";

// STUB: deterministic mock QuickBooks financials for the last 30 days.
// Replace with real Intuit QBO API calls (Reports/BalanceSheet, AR/AP aging,
// P&L) when credentials are wired.
export async function runQuickbooksPull() {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const rows = lastNDates(30).map((as_of_date) => {
    const k = (suffix: string) => `qb:${as_of_date}:${suffix}`;
    const ar_aging_current = seedNumber(k("ar0"), 30000, 60000);
    const ar_aging_30 = seedNumber(k("ar30"), 10000, 25000);
    const ar_aging_60 = seedNumber(k("ar60"), 4000, 12000);
    const ar_aging_90 = seedNumber(k("ar90"), 1500, 6000);
    const ar_aging_over_90 = seedNumber(k("ar90+"), 500, 4000);
    const ar_total =
      ar_aging_current + ar_aging_30 + ar_aging_60 + ar_aging_90 + ar_aging_over_90;

    const ap_total = seedNumber(k("ap"), 50000, 120000);
    const ap_due_30 = Math.round(ap_total * 0.42 * 100) / 100;

    const revenue = seedNumber(k("rev"), 8000, 18000);
    const cogs = Math.round(revenue * seedNumber(k("cogs_pct"), 0.32, 0.4, 4) * 100) / 100;
    const expenses = seedNumber(k("exp"), 2000, 5000);
    const net_income = Math.round((revenue - cogs - expenses) * 100) / 100;

    return {
      as_of_date,
      cash_position: seedNumber(k("cash"), 200000, 400000),
      ar_total: Math.round(ar_total * 100) / 100,
      ar_aging_current,
      ar_aging_30,
      ar_aging_60,
      ar_aging_90,
      ar_aging_over_90,
      ap_total,
      ap_due_30,
      revenue,
      cogs,
      expenses,
      net_income,
      synced_at: now,
    };
  });

  const { error } = await supabase
    .from("qb_financials")
    .upsert(rows, { onConflict: "as_of_date" });

  if (error) throw new Error(`qb_financials upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
