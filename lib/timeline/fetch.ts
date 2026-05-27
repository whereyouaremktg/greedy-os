import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildCampaignEvents,
  buildCampaignTaskEvents,
  buildManufacturingEvents,
  buildPaymentEvents,
  buildPoLineCancelEvents,
  buildPurchaseOrderEvents,
  mergeTimelineEvents,
} from "@/lib/timeline/build-events";
import type { TimelineEvent } from "@/lib/timeline/types";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export async function fetchTimelineEvents(
  supabase: Client,
): Promise<{ events: TimelineEvent[]; error?: string }> {
  const [
    runsResult,
    posResult,
    poLinesResult,
    paymentsResult,
    campaignsResult,
    tasksResult,
  ] = await Promise.all([
    supabase
      .from("manufacturing_runs")
      .select(
        `id, product_name, variant, quantity, stage,
         expected_completion_date, expected_arrival_date,
         actual_completion_date, actual_arrival_date,
         vendors!inner ( name )`,
      )
      .order("expected_arrival_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("purchase_orders")
      .select(
        `id, po_number, status, order_date, expected_date,
         vendors!inner ( name )`,
      )
      .order("expected_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("po_line_items")
      .select(
        `id, purchase_order_id, product_name, color, quantity, cancel_date,
         purchase_orders!inner (
           po_number,
           vendors!inner ( name )
         )`,
      )
      .not("cancel_date", "is", null)
      .order("cancel_date", { ascending: true }),
    supabase
      .from("po_payments")
      .select(
        `id, purchase_order_id, label, amount, paid, due_date, paid_date,
         purchase_orders ( po_number )`,
      )
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("campaigns")
      .select("id, name, type, status, start_date, end_date")
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("campaign_tasks")
      .select(
        `id, campaign_id, title, status, owner, due_date,
         campaigns!inner ( name )`,
      )
      .not("due_date", "is", null)
      .order("due_date", { ascending: true }),
  ]);

  const firstError =
    runsResult.error ??
    posResult.error ??
    poLinesResult.error ??
    paymentsResult.error ??
    campaignsResult.error ??
    tasksResult.error;

  if (firstError) {
    return { events: [], error: firstError.message };
  }

  const runs = (runsResult.data ?? []).map((row) => ({
    id: row.id,
    product_name: row.product_name,
    variant: row.variant,
    quantity: row.quantity,
    stage: row.stage,
    expected_completion_date: row.expected_completion_date,
    expected_arrival_date: row.expected_arrival_date,
    actual_completion_date: row.actual_completion_date,
    actual_arrival_date: row.actual_arrival_date,
    vendor_name:
      (row.vendors as { name: string } | null)?.name ?? "Unknown vendor",
  }));

  const pos = (posResult.data ?? []).map((row) => ({
    id: row.id,
    po_number: row.po_number,
    status: row.status,
    order_date: row.order_date,
    expected_date: row.expected_date,
    vendor_name:
      (row.vendors as { name: string } | null)?.name ?? "Unknown vendor",
  }));

  const poLines = (poLinesResult.data ?? []).map((row) => {
    const po = row.purchase_orders as {
      po_number: string | null;
      vendors: { name: string } | null;
    } | null;

    return {
      id: row.id,
      purchase_order_id: row.purchase_order_id,
      product_name: row.product_name,
      color: row.color,
      quantity: Number(row.quantity),
      cancel_date: row.cancel_date,
      po_number: po?.po_number ?? null,
      vendor_name: po?.vendors?.name ?? "Unknown buyer",
    };
  });

  const payments = (paymentsResult.data ?? []).map((row) => ({
    id: row.id,
    purchase_order_id: row.purchase_order_id,
    label: row.label,
    amount: row.amount,
    paid: row.paid,
    due_date: row.due_date,
    paid_date: row.paid_date,
    po_number:
      (row.purchase_orders as { po_number: string | null } | null)?.po_number ??
      null,
  }));

  const campaigns = campaignsResult.data ?? [];
  const tasks = (tasksResult.data ?? []).map((row) => ({
    id: row.id,
    campaign_id: row.campaign_id,
    title: row.title,
    status: row.status,
    owner: row.owner,
    due_date: row.due_date,
    campaign_name:
      (row.campaigns as { name: string } | null)?.name ?? "Campaign",
  }));

  const events = mergeTimelineEvents(
    buildManufacturingEvents(runs),
    buildPurchaseOrderEvents(pos),
    buildPoLineCancelEvents(poLines),
    buildPaymentEvents(payments),
    buildCampaignEvents(campaigns),
    buildCampaignTaskEvents(tasks),
  );

  return { events };
}
