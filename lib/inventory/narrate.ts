// Claude narration layer for the deterministic inventory forecast.
//
// The numbers come entirely from lib/inventory/forecast.ts — Claude only turns
// the already-computed reorderQty / stockoutDate / orderByDate / yoyGrowth /
// status / reasons into prose. The model is explicitly forbidden from inventing
// or altering any quantity or date; everything it cites is passed to it.
import "server-only";

import { generateObject } from "ai";
import { z } from "zod";

import { GLOW_DIGEST_MODEL } from "@/lib/ai/model";
import type { SkuForecast } from "@/lib/inventory/forecast";

// Statuses that warrant a narrated callout.
const NARRATABLE = new Set(["order_now", "order_soon", "demand_down"]);
const MAX_CALLOUTS = 6;

const calloutSchema = z.object({
  sku: z
    .string()
    .describe("The SKU this callout is about — copy it verbatim from the input."),
  text: z
    .string()
    .describe(
      "One concise line narrating this SKU. Lead with the action + the exact computed numbers/dates provided (reorderQty, orderByDate, stockoutDate, onHand, yoyGrowth). Do not invent or change any number.",
    ),
  urgency: z.enum(["high", "medium", "low"]),
});

const narrationSchema = z.object({
  headline: z
    .string()
    .describe(
      "One punchy bottom-line sentence: which SKUs must be ordered this week and why. Reference only the SKUs and numbers provided.",
    ),
  callouts: z
    .array(calloutSchema)
    .describe("One callout per provided SKU, in the same order; empty if none."),
});

export type ForecastNarration = z.infer<typeof narrationSchema>;

const SYSTEM = `You are Glow OS's inventory analyst writing a terse reorder briefing.

You are given a pre-computed, authoritative inventory forecast. Every quantity
and date has already been calculated deterministically and drives real PO spend.

HARD RULES:
- NEVER invent, estimate, round, or alter any number or date. Use only the exact
  values provided (reorderQty, onHand, incomingUnits, monthsOfCover, stockoutDate,
  orderByDate, baseMonthlyRunRate, yoyGrowth). yoyGrowth is a fraction (0.42 = +42%).
- Only narrate the SKUs provided. Do not add SKUs or commentary about ones not given.
- One callout per provided SKU, preserving the given order (already urgent-first).
- Map status to urgency: order_now -> "high", order_soon -> "medium", demand_down -> "low".
- The headline calls out the order_now SKUs (the ones that must be ordered this week)
  and the single most important reason. If there are none, say what's next-most-urgent.
- Be specific and plain. Lead each line with the action and the concrete number/date.`;

/**
 * Narrate the deterministic forecast into a headline + per-SKU callouts.
 * Only order_now / order_soon / demand_down SKUs are narrated (capped ~6).
 * The model only rephrases the supplied numbers — it never computes them.
 */
export async function narrateForecast(
  forecasts: SkuForecast[],
): Promise<{
  headline: string;
  callouts: { sku: string; text: string; urgency: "high" | "medium" | "low" }[];
}> {
  const toNarrate = forecasts
    .filter((f) => NARRATABLE.has(f.status))
    .slice(0, MAX_CALLOUTS);

  if (toNarrate.length === 0) {
    return {
      headline: "No SKUs need ordering this week — inventory is comfortable.",
      callouts: [],
    };
  }

  // Pass only the authoritative fields the model is allowed to cite.
  const payload = toNarrate.map((f) => ({
    sku: f.sku,
    productTitle: f.productTitle,
    status: f.status,
    onHand: f.onHand,
    incomingUnits: f.incomingUnits,
    baseMonthlyRunRate: f.baseMonthlyRunRate,
    yoyGrowth: f.yoyGrowth,
    monthsOfCover: f.monthsOfCover,
    stockoutDate: f.stockoutDate,
    orderByDate: f.orderByDate,
    reorderQty: f.reorderQty,
    reasons: f.reasons,
  }));

  const { object } = await generateObject({
    model: GLOW_DIGEST_MODEL,
    schema: narrationSchema,
    system: `${SYSTEM}\n\nFORECAST (authoritative — narrate only these):\n${JSON.stringify(payload)}`,
    prompt: `Write the reorder briefing as of ${new Date().toISOString().slice(0, 10)}.`,
  });

  return object;
}

/**
 * Pure, deterministic compact summary of the actionable forecast for the
 * analyst context (no AI). Lists order_now / order_soon SKUs with the figures
 * the analyst is most likely to be asked about.
 */
export function summarizeForecastForContext(forecasts: SkuForecast[]): string {
  const actionable = forecasts.filter(
    (f) => f.status === "order_now" || f.status === "order_soon",
  );
  if (actionable.length === 0) {
    return "Inventory forecast: no SKUs require reordering right now.";
  }

  const lines = actionable.map((f) => {
    const cover =
      f.monthsOfCover != null ? `${f.monthsOfCover}mo cover` : "cover n/a";
    const orderBy = f.orderByDate ? `order by ${f.orderByDate}` : "order by n/a";
    const label = f.status === "order_now" ? "ORDER NOW" : "order soon";
    return `- ${f.sku} (${f.productTitle}) [${label}]: ${f.onHand} on-hand, ${cover}, ${orderBy}, reorder ${f.reorderQty} units`;
  });

  return `Inventory forecast — ${actionable.length} SKU(s) need ordering:\n${lines.join("\n")}`;
}
