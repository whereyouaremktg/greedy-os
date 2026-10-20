// Input schemas for the Q4 Targets server actions.
//
// They live here, not in lib/actions/*, because a "use server" module may
// export async functions only: exporting a zod object from one makes Next's
// production runtime throw "A \"use server\" file can only export async
// functions, found object" for every action on the page (the Refresh button
// included). Components import the input types from here too.

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const optDate = isoDate.nullable().optional();
const money = z.number().nonnegative().nullable();

export const wholesalePoInputSchema = z.object({
  id: z.string().uuid().optional(),
  partner_name: z.string().min(1).max(200),
  po_number: z.string().max(100).nullable().optional(),
  total: z.number().nonnegative(),
  status: z.enum([
    "draft",
    "sent",
    "confirmed",
    "in_fulfillment",
    "shipped",
    "partially_received",
    "received",
    "closed",
    "cancelled",
  ]),
  order_date: optDate,
  ship_date: optDate,
  expected_date: optDate,
  invoice_date: optDate,
  invoice_number: z.string().max(100).nullable().optional(),
  invoiced_amount: z.number().nonnegative().nullable().optional(),
  paid_date: optDate,
  notes: z.string().max(2000).nullable().optional(),
});
export type WholesalePoInput = z.infer<typeof wholesalePoInputSchema>;

export const weeklyInputsSchema = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ad_spend_meta: money,
  ad_spend_tiktok: money,
  ad_spend_google: money,
  ad_spend_other: money,
  threepl_cost: money,
  other_opex: money,
  cogs_override: money,
  notes: z.string().max(2000).nullable(),
});
export type WeeklyInputsInput = z.infer<typeof weeklyInputsSchema>;

export const launchDropSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  drop_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  planned_units: z.number().int().nonnegative().nullable(),
  skus: z.array(z.string().min(1).max(100)).max(50),
  notes: z.string().max(2000).nullable(),
});
export type LaunchDropInput = z.infer<typeof launchDropSchema>;
