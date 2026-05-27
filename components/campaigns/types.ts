import type {
  CampaignLinkSource,
  CampaignStatus,
  CampaignTaskStatus,
  CampaignType,
} from "@/lib/campaigns/types";

export type CampaignTaskRow = {
  id: string;
  campaign_id: string;
  title: string;
  owner: string | null;
  status: CampaignTaskStatus;
  due_date: string | null;
  created_at: string;
};

export type CampaignLinkRow = {
  id: string;
  campaign_id: string;
  label: string;
  url: string;
  source: CampaignLinkSource;
  created_at: string;
};

export type CampaignRow = {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tasks: CampaignTaskRow[];
  links: CampaignLinkRow[];
};

export type BoardTaskRow = CampaignTaskRow & {
  campaign_name: string;
  campaign_type: CampaignType;
  campaign_status: CampaignStatus;
};

export function taskProgress(tasks: CampaignTaskRow[]): {
  done: number;
  total: number;
} {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { done, total };
}

export function flattenBoardTasks(campaigns: CampaignRow[]): BoardTaskRow[] {
  return campaigns.flatMap((campaign) =>
    campaign.tasks.map((task) => ({
      ...task,
      campaign_name: campaign.name,
      campaign_type: campaign.type,
      campaign_status: campaign.status,
    })),
  );
}

export function computeCampaignSummary(campaigns: CampaignRow[]) {
  const active = campaigns.filter((c) => c.status === "active").length;
  const planning = campaigns.filter((c) => c.status === "planning").length;

  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const tasksDueThisWeek = campaigns
    .flatMap((c) => c.tasks)
    .filter((task) => {
      if (!task.due_date || task.status === "done") return false;
      const due = new Date(`${task.due_date}T12:00:00`);
      return due >= today && due <= weekEnd;
    }).length;

  const launchingSoon = campaigns.filter((campaign) => {
    if (campaign.status !== "planning" && campaign.status !== "active") {
      return false;
    }
    if (!campaign.start_date) return false;
    const start = new Date(`${campaign.start_date}T12:00:00`);
    const diffDays = Math.ceil(
      (start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diffDays >= 0 && diffDays <= 14;
  }).length;

  return { active, planning, tasksDueThisWeek, launchingSoon };
}
