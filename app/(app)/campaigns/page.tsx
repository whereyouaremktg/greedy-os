import { Suspense } from "react";

import { CampaignsView } from "@/components/campaigns/campaigns-view";
import type { CampaignRow } from "@/components/campaigns/types";
import { createClient } from "@/lib/supabase/server";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `id, name, type, status, start_date, end_date, notes, created_at, updated_at,
       campaign_tasks ( id, campaign_id, title, owner, status, due_date, created_at ),
       campaign_links ( id, campaign_id, label, url, source, created_at )`,
    )
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load campaigns: {error.message}
        </div>
      </div>
    );
  }

  const campaigns: CampaignRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    start_date: row.start_date,
    end_date: row.end_date,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tasks: (row.campaign_tasks ?? []).map((task) => ({
      id: task.id,
      campaign_id: task.campaign_id,
      title: task.title,
      owner: task.owner,
      status: task.status,
      due_date: task.due_date,
      created_at: task.created_at,
    })),
    links: (row.campaign_links ?? []).map((link) => ({
      id: link.id,
      campaign_id: link.campaign_id,
      label: link.label,
      url: link.url,
      source: link.source,
      created_at: link.created_at,
    })),
  }));

  return (
    <Suspense fallback={null}>
      <CampaignsView
        campaigns={campaigns}
        initialCreateOpen={params.new === "1"}
      />
    </Suspense>
  );
}
