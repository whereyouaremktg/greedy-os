import { z } from "zod";

import {
  CAMPAIGN_LINK_SOURCES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TASK_STATUSES,
  CAMPAIGN_TYPES,
} from "@/lib/campaigns/types";

// Shared campaign form schemas. Kept out of the "use server" action file
// because those may only export async functions.

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z
      .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
      .transform((v) => (v.length > 0 ? v : null)),
  );

export const campaignSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Name is required")),
  type: z.enum(CAMPAIGN_TYPES),
  status: z.enum(CAMPAIGN_STATUSES),
  start_date: optionalDate,
  end_date: optionalDate,
  notes: optionalText,
});

export type CampaignFormValues = z.input<typeof campaignSchema>;

export const taskSchema = z.object({
  campaign_id: z.string().uuid(),
  title: z
    .string()
    .max(300)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Title is required")),
  owner: optionalText,
  due_date: optionalDate,
  status: z.enum(CAMPAIGN_TASK_STATUSES).optional(),
});

export type TaskFormValues = z.input<typeof taskSchema>;

export const linkSchema = z.object({
  campaign_id: z.string().uuid(),
  label: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Label is required")),
  url: z
    .string()
    .max(2000)
    .transform((v) => v.trim())
    .pipe(z.string().url("Enter a valid URL")),
  source: z.enum(CAMPAIGN_LINK_SOURCES),
});

export type LinkFormValues = z.input<typeof linkSchema>;
