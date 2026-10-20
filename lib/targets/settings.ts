// Typed shape of the `targets_settings` row with key `q4_2026`, plus the
// defaults that migration 0023 seeds. zod guards what the UI writes back.

import { z } from "zod";

export const TARGETS_SETTINGS_KEY = "q4_2026";

export const tierSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().nonnegative(),
});

export const targetsSettingsSchema = z.object({
  year: z.number().int(),
  tiers: z.array(tierSchema).min(1),
  guardrails: z.object({
    net_margin_min_pct: z.number(),
    cash_reserve_min: z.number(),
  }),
  overrides: z.object({
    net_margin_pct: z.number().nullable(),
    cash_balance: z.number().nullable(),
    non_shopify_baseline_2025: z.number().nullable(),
    notes: z.string().default(""),
  }),
  bfcm: z.object({
    start: z.string(),
    end: z.string(),
    bf_cm_start: z.string(),
    bf_cm_end: z.string(),
    early_access: z.string(),
    sla_ship_by: z.string(),
  }),
  staffing: z.object({
    bfcm_orders: z.object({
      safe: z.number(),
      baseline: z.number(),
      aggressive: z.number(),
    }),
    busiest_day: z.object({
      safe: z.number(),
      baseline: z.number(),
      aggressive: z.number(),
    }),
  }),
  flags: z.object({
    discount_rate_max_pct: z.number(),
  }),
  count_b2b_in_total: z.boolean(),
  /** RetroShip rate card; postage comes from ShipHero labels, these are the rest. */
  fulfillment: z.object({
    pick_pack_per_order: z.number().nonnegative().nullable(),
    pick_pack_per_extra_unit: z.number().nonnegative().nullable(),
    packaging_per_order: z.number().nonnegative().nullable(),
    notes: z.string().default(""),
  }),
});

export type TargetsSettings = z.infer<typeof targetsSettingsSchema>;

export const DEFAULT_TARGETS_SETTINGS: TargetsSettings = {
  year: 2026,
  tiers: [
    { key: "plan", label: "Plan", amount: 1_100_000 },
    { key: "stretch", label: "Stretch", amount: 1_200_000 },
    { key: "crush", label: "Crush", amount: 1_500_000 },
  ],
  guardrails: { net_margin_min_pct: 25, cash_reserve_min: 150_000 },
  overrides: {
    net_margin_pct: null,
    cash_balance: null,
    non_shopify_baseline_2025: 130_000,
    notes: "",
  },
  bfcm: {
    start: "2026-11-09",
    end: "2026-12-15",
    bf_cm_start: "2026-11-27",
    bf_cm_end: "2026-11-30",
    early_access: "2026-11-24",
    sla_ship_by: "2026-12-03",
  },
  staffing: {
    bfcm_orders: { safe: 2840, baseline: 4040, aggressive: 4960 },
    busiest_day: { safe: 1140, baseline: 1640, aggressive: 2030 },
  },
  flags: { discount_rate_max_pct: 10 },
  count_b2b_in_total: true,
  fulfillment: {
    pick_pack_per_order: null,
    pick_pack_per_extra_unit: null,
    packaging_per_order: null,
    notes: "",
  },
};

/** Parse a stored jsonb value, falling back to defaults field by field. */
export function parseTargetsSettings(raw: unknown): TargetsSettings {
  const merged = deepMerge(DEFAULT_TARGETS_SETTINGS, raw);
  const result = targetsSettingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_TARGETS_SETTINGS;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(patch) || !isObject(base)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = isObject(v) && isObject(b) ? deepMerge(b, v) : v;
  }
  return out as T;
}
