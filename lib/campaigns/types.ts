import type { Database } from "@/types/db";

export type CampaignType = Database["public"]["Enums"]["campaign_type"];
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
export type CampaignTaskStatus =
  Database["public"]["Enums"]["campaign_task_status"];
export type CampaignLinkSource =
  Database["public"]["Enums"]["campaign_link_source"];

export const CAMPAIGN_TYPES: CampaignType[] = [
  "launch",
  "seasonal",
  "dtc_email",
  "wholesale_push",
  "other",
];

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "planning",
  "active",
  "complete",
  "archived",
];

export const CAMPAIGN_TASK_STATUSES: CampaignTaskStatus[] = [
  "todo",
  "in_progress",
  "done",
];

export const CAMPAIGN_LINK_SOURCES: CampaignLinkSource[] = [
  "klaviyo",
  "canva",
  "shopify",
  "hubspot",
  "other",
];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  launch: "Product launch",
  seasonal: "Seasonal promo",
  dtc_email: "DTC email",
  wholesale_push: "Wholesale push",
  other: "Other",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: "Planning",
  active: "Active",
  complete: "Complete",
  archived: "Archived",
};

export const CAMPAIGN_TASK_STATUS_LABELS: Record<CampaignTaskStatus, string> =
  {
    todo: "To do",
    in_progress: "In progress",
    done: "Done",
  };

export const CAMPAIGN_LINK_SOURCE_LABELS: Record<CampaignLinkSource, string> = {
  klaviyo: "Klaviyo",
  canva: "Canva",
  shopify: "Shopify",
  hubspot: "HubSpot",
  other: "Other",
};
