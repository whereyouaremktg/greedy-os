import type { CampaignType } from "@/lib/campaigns/types";

export type CampaignTaskTemplate = {
  title: string;
  /** Days before campaign start_date (negative = after start). */
  offsetDays: number;
};

/** Default checklist seeded when creating a campaign by type. */
export const CAMPAIGN_TASK_TEMPLATES: Record<
  CampaignType,
  CampaignTaskTemplate[]
> = {
  dtc_email: [
    { title: "Finalize offer & segment", offsetDays: -7 },
    { title: "Write email copy", offsetDays: -5 },
    { title: "Design in Klaviyo", offsetDays: -4 },
    { title: "QA test send", offsetDays: -2 },
    { title: "Schedule send", offsetDays: 0 },
  ],
  wholesale_push: [
    { title: "Update line sheet / pricing", offsetDays: -10 },
    { title: "Identify target accounts", offsetDays: -8 },
    { title: "Prepare outreach emails", offsetDays: -5 },
    { title: "HubSpot sequence setup", offsetDays: -3 },
    { title: "Follow-up cadence", offsetDays: 2 },
  ],
  launch: [
    { title: "Confirm inventory & SKUs", offsetDays: -14 },
    { title: "Shopify collection / landing page", offsetDays: -10 },
    { title: "Launch email sequence", offsetDays: -7 },
    { title: "Social assets (Canva)", offsetDays: -5 },
    { title: "Go-live checklist", offsetDays: 0 },
  ],
  seasonal: [
    { title: "Creative theme & offer", offsetDays: -14 },
    { title: "Email + SMS calendar", offsetDays: -10 },
    { title: "Site merchandising update", offsetDays: -7 },
    { title: "Paid media assets", offsetDays: -5 },
    { title: "Launch timing lock", offsetDays: -2 },
  ],
  other: [
    { title: "Define goal & audience", offsetDays: -7 },
    { title: "Creative brief", offsetDays: -5 },
    { title: "Execution checklist", offsetDays: -2 },
    { title: "Performance review", offsetDays: 7 },
  ],
};

export function dueDateFromOffset(
  startDate: string | null,
  offsetDays: number,
): string | null {
  if (!startDate) return null;
  const base = new Date(`${startDate}T12:00:00`);
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}
