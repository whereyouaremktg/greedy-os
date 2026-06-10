import { generateObject } from "ai";
import { format } from "date-fns";
import { z } from "zod";

import { buildGlowContext } from "@/lib/ai/context";
import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_DIGEST_MODEL } from "@/lib/ai/model";
import { GLOW_DIGEST_PROMPT } from "@/lib/ai/prompt";
import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { forecastAll } from "@/lib/inventory/forecast";
import { loadForecastInputsService } from "@/lib/inventory/load";
import { narrateForecast } from "@/lib/inventory/narrate";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import {
  digestBlocks,
  type DigestCash,
  type DigestReorder,
  type DigestSales,
  type DigestStockItem,
} from "@/lib/slack/digest";
import { sendSlack } from "@/lib/slack/dispatch";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const bulletSchema = z.object({
  text: z
    .string()
    .describe("One concise line; lead with the concrete thing + number/date."),
  urgency: z.enum(["alert", "warn", "info"]),
});

const narrativeSchema = z.object({
  headline: z.string().describe("One plain-language sentence on overall state."),
  purchaseOrders: z
    .array(bulletSchema)
    .describe("PO items needing attention; empty array if none."),
  manufacturing: z
    .array(bulletSchema)
    .describe("Manufacturing run updates worth knowing; empty array if none."),
});

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return runCronJob(async () => {
    const supabase = createServiceClient();
    const channel = getSlackDefaultChannel();
    const today = isoDaysAgo(0);
    const yesterday = isoDaysAgo(1);

    // --- Deterministic sales (yesterday + prior day for delta) ---
    const { data: salesRows } = await supabase
      .from("shopify_metrics")
      .select(
        "as_of_date, revenue, order_count, dtc_revenue, wholesale_revenue, wholesale_order_count, aov, sessions, conversion_rate, new_customer_count, returning_customer_count, synced_at",
      )
      .lt("as_of_date", today)
      .order("as_of_date", { ascending: false })
      .limit(2);

    const y = salesRows?.[0];
    const prior = salesRows?.[1];
    const sales: DigestSales | null = y
      ? {
          asOfDate: y.as_of_date,
          revenue: y.revenue ?? 0,
          dtcRevenue: y.dtc_revenue,
          wholesaleRevenue: y.wholesale_revenue,
          orderCount: y.order_count ?? 0,
          wholesaleOrderCount: y.wholesale_order_count,
          aov: y.aov,
          conversionRate: y.conversion_rate,
          sessions: y.sessions,
          newCustomers: y.new_customer_count,
          returningCustomers: y.returning_customer_count,
          revenueDeltaPct:
            prior?.revenue && prior.revenue > 0 && y.revenue != null
              ? ((y.revenue - prior.revenue) / prior.revenue) * 100
              : null,
          stale: y.as_of_date !== yesterday,
        }
      : null;

    // --- Deterministic cash ---
    const { data: qbRows } = await supabase
      .from("qb_financials")
      .select("as_of_date, cash_position, ar_aging_over_90")
      .order("as_of_date", { ascending: false })
      .limit(1);

    const qb = qbRows?.[0];
    const cash: DigestCash | null = qb
      ? {
          asOfDate: qb.as_of_date,
          cashPosition: qb.cash_position,
          arOver90: qb.ar_aging_over_90,
          stale: qb.as_of_date < isoDaysAgo(3),
        }
      : null;

    // --- Low / oversold stock (tracked variants under threshold) ---
    const LOW_STOCK_THRESHOLD = 25;
    const { data: stockRows } = await supabase
      .from("shopify_inventory")
      .select("product_title, variant_title, sku, inventory_quantity")
      .lt("inventory_quantity", LOW_STOCK_THRESHOLD)
      .order("inventory_quantity", { ascending: true })
      .limit(8);

    const stock: DigestStockItem[] = (stockRows ?? []).map((r) => ({
      productTitle: r.product_title,
      variantTitle: r.variant_title,
      sku: r.sku,
      quantity: r.inventory_quantity,
    }));

    // --- Deterministic inventory forecast (numbers) + narration (prose) ---
    // forecastAll is authoritative for every quantity/date; the model only
    // rephrases. Reads via the service client since the cron has no cookies.
    const forecastInputs = await loadForecastInputsService();
    const forecasts = forecastAll(forecastInputs, { asOf: new Date() });

    const narrationBySku = new Map(
      (await narrateForecast(forecasts)).callouts.map((c) => [c.sku, c]),
    );

    const reorder: DigestReorder = {
      orderItems: forecasts
        .filter((f) => f.status === "order_now" || f.status === "order_soon")
        .map((f) => ({
          sku: f.sku,
          productTitle: f.productTitle,
          status: f.status as "order_now" | "order_soon",
          onHand: f.onHand,
          orderByDate: f.orderByDate,
          reorderQty: f.reorderQty,
          note: narrationBySku.get(f.sku)?.text ?? null,
        })),
      demandDown: forecasts
        .filter((f) => f.status === "demand_down")
        .map((f) => ({
          sku: f.sku,
          productTitle: f.productTitle,
          yoyGrowth: f.yoyGrowth,
          note: narrationBySku.get(f.sku)?.text ?? null,
        })),
    };

    // --- Model narrative (headline + PO/manufacturing bullets) ---
    const context = await buildGlowContext(supabase);
    const { object: narrative } = await withModelFallback(
      GLOW_DIGEST_MODEL,
      (model) =>
        generateObject({
          model,
          schema: narrativeSchema,
          system: `${GLOW_DIGEST_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
          prompt: `Produce the briefing narrative for ${yesterday}.`,
        }),
    );

    const blocks = digestBlocks({
      heading: "☀️ Glow OS — morning briefing",
      dateLabel: format(new Date(), "EEEE, MMMM d"),
      narrative,
      sales,
      cash,
      stock,
      reorder,
    });

    const send = await sendSlack({
      channel,
      dedupeKey: `daily-digest:${today}`,
      text: `Glow OS morning briefing — ${narrative.headline}`,
      blocks,
    });

    return { ok: true, posted: "sent" in send && send.sent, date: today };
  });
}
