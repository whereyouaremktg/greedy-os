export type TimelineCategory =
  | "manufacturing"
  | "purchase_order"
  | "payment"
  | "campaign"
  | "campaign_task"
  | "deal";

export type TimelineEventKind = "milestone" | "range";

export type TimelineUrgency = "overdue" | "soon" | "neutral";

export type TimelineEvent = {
  id: string;
  category: TimelineCategory;
  kind: TimelineEventKind;
  /** Primary sort key — start date for ranges */
  date: string;
  endDate?: string | null;
  title: string;
  subtitle?: string;
  label: string;
  status?: string;
  urgency?: TimelineUrgency;
  href?: string;
};

export const CATEGORY_LABELS: Record<TimelineCategory, string> = {
  manufacturing: "Manufacturing",
  purchase_order: "Purchase orders",
  payment: "Payments",
  campaign: "Campaigns",
  campaign_task: "Campaign tasks",
  deal: "HubSpot deals",
};

export const CATEGORY_ORDER: TimelineCategory[] = [
  "manufacturing",
  "purchase_order",
  "payment",
  "campaign",
  "campaign_task",
];
