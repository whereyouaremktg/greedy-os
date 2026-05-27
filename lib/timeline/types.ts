export type TimelineCategory =
  | "manufacturing"
  | "purchase_order"
  | "payment"
  | "campaign"
  | "campaign_task"
  | "deal";

export type TimelineEventKind = "milestone" | "range";

export type TimelineUrgency = "overdue" | "soon" | "neutral";

export type TimelineEventMeta = {
  label: string;
  value: string;
};

export type TimelineEvent = {
  id: string;
  category: TimelineCategory;
  kind: TimelineEventKind;
  /** Primary sort key — start date for ranges */
  date: string;
  endDate?: string | null;
  title: string;
  /** Free-form fallback when structured meta is not provided. */
  subtitle?: string;
  /** What the date represents (e.g. "Expected arrival"). */
  label: string;
  /** Short headline stat shown inline (e.g. "5,500 units", "$24K"). */
  accent?: string;
  /** Structured key/value details rendered in cards and the detail sheet. */
  meta?: TimelineEventMeta[];
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
