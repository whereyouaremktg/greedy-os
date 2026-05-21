import { createServiceClient } from "@/lib/supabase/service";
import { lastNDates, seedInt, seedNumber } from "./_mock";

// STUB: deterministic mock Klaviyo email + affiliate revenue for the last 30 days.
// Replace with real Klaviyo Metrics API (`query_metric_aggregates`) when wired.
export async function runKlaviyoPull() {
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const rows = lastNDates(30).map((as_of_date) => {
    const k = (suffix: string) => `klaviyo:${as_of_date}:${suffix}`;
    const email_revenue = seedNumber(k("email"), 800, 4000);
    const affiliate_revenue = seedNumber(k("aff"), 400, 2200);
    const open_rate = seedNumber(k("open"), 0.28, 0.5, 4);
    const click_rate = seedNumber(k("click"), 0.018, 0.07, 4);

    const campaigns = [
      {
        name: "Daily Drop",
        sent: seedInt(k("c1sent"), 4000, 9000),
        opens: seedInt(k("c1opens"), 1200, 4000),
        clicks: seedInt(k("c1clicks"), 80, 400),
        revenue: seedNumber(k("c1rev"), 300, 1500),
      },
      {
        name: "Brightening Bundle Promo",
        sent: seedInt(k("c2sent"), 3000, 8000),
        opens: seedInt(k("c2opens"), 900, 3000),
        clicks: seedInt(k("c2clicks"), 60, 300),
        revenue: seedNumber(k("c2rev"), 200, 1200),
      },
    ];

    const flows = [
      {
        name: "Welcome Series",
        revenue: seedNumber(k("f1rev"), 200, 900),
      },
      {
        name: "Abandoned Cart",
        revenue: seedNumber(k("f2rev"), 150, 700),
      },
    ];

    return {
      as_of_date,
      email_revenue,
      affiliate_revenue,
      open_rate,
      click_rate,
      campaigns,
      flows,
      synced_at: now,
    };
  });

  const { error } = await supabase
    .from("klaviyo_metrics")
    .upsert(rows, { onConflict: "as_of_date" });

  if (error) throw new Error(`klaviyo_metrics upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
