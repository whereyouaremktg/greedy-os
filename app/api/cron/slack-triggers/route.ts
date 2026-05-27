import { getISOWeek, getISOWeekYear } from "date-fns";
import { runCronJob, verifyCronSecret } from "@/lib/cron-auth";
import { getSlackDefaultChannel } from "@/lib/slack/client";
import { sendSlack } from "@/lib/slack/dispatch";
import {
  arOver90Blocks,
  paymentDueBlocks,
  runStageBlocks,
} from "@/lib/slack/messages";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isoWeekKey(date = new Date()): string {
  const year = getISOWeekYear(date);
  const week = String(getISOWeek(date)).padStart(2, "0");
  return `${year}-${week}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const denied = verifyCronSecret(request);
  if (denied) return denied;

  return runCronJob(async () => {
  const supabase = createServiceClient();
  const channel = getSlackDefaultChannel();
  const today = todayIso();
  const dueHorizon = addDaysIso(3);
  const week = isoWeekKey();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const summary = {
    due: { sent: 0, skipped: 0 },
    overdue: { sent: 0, skipped: 0 },
    runs: { sent: 0, skipped: 0 },
    ar: { sent: 0, skipped: 0 },
  };

  const { data: duePayments } = await supabase
    .from("po_payments")
    .select(
      `
      id,
      label,
      amount,
      due_date,
      purchase_orders!inner (
        id,
        vendors!inner ( name )
      )
    `,
    )
    .eq("paid", false)
    .gte("due_date", today)
    .lte("due_date", dueHorizon);

  for (const row of duePayments ?? []) {
    const po = row.purchase_orders as {
      id: string;
      vendors: { name: string };
    };
    const dedupeKey = `po-payment-due:${row.id}:${row.due_date}`;
    const result = await sendSlack({
      channel,
      dedupeKey,
      text: `PO payment due: ${po.vendors.name} ${row.amount}`,
      blocks: paymentDueBlocks({
        id: row.id,
        label: row.label,
        amount: Number(row.amount),
        due_date: row.due_date,
        vendorName: po.vendors.name,
        poId: po.id,
      }),
    });
    if ("sent" in result && result.sent) summary.due.sent++;
    else summary.due.skipped++;
  }

  const { data: overduePayments } = await supabase
    .from("po_payments")
    .select(
      `
      id,
      label,
      amount,
      due_date,
      purchase_orders!inner (
        id,
        vendors!inner ( name )
      )
    `,
    )
    .eq("paid", false)
    .lt("due_date", today);

  for (const row of overduePayments ?? []) {
    const po = row.purchase_orders as {
      id: string;
      vendors: { name: string };
    };
    const dedupeKey = `po-payment-overdue:${row.id}:${week}`;
    const result = await sendSlack({
      channel,
      dedupeKey,
      text: `PO payment overdue: ${po.vendors.name} ${row.amount}`,
      blocks: paymentDueBlocks(
        {
          id: row.id,
          label: row.label,
          amount: Number(row.amount),
          due_date: row.due_date,
          vendorName: po.vendors.name,
          poId: po.id,
        },
        { overdue: true },
      ),
    });
    if ("sent" in result && result.sent) summary.overdue.sent++;
    else summary.overdue.skipped++;
  }

  const { data: runs } = await supabase
    .from("manufacturing_runs")
    .select(
      `
      id,
      product_name,
      stage,
      updated_at,
      vendors!inner ( name )
    `,
    )
    .in("stage", ["in_transit", "received"])
    .gt("updated_at", thirtyMinAgo);

  for (const row of runs ?? []) {
    const vendor = row.vendors as { name: string };
    const dedupeKey = `run-stage:${row.id}:${row.stage}`;
    const result = await sendSlack({
      channel,
      dedupeKey,
      text: `Manufacturing run ${row.product_name} — ${row.stage}`,
      blocks: runStageBlocks({
        id: row.id,
        product_name: row.product_name,
        stage: row.stage,
        vendorName: vendor.name,
      }),
    });
    if ("sent" in result && result.sent) summary.runs.sent++;
    else summary.runs.skipped++;
  }

  const { data: qbRows } = await supabase
    .from("qb_financials")
    .select("as_of_date, ar_aging_over_90")
    .order("as_of_date", { ascending: false })
    .limit(1);

  const latest = qbRows?.[0];
  if (latest && Number(latest.ar_aging_over_90) > 5000) {
    const dedupeKey = `ar-90+:${week}`;
    const result = await sendSlack({
      channel,
      dedupeKey,
      text: `AR 90+ alert: ${latest.ar_aging_over_90}`,
      blocks: arOver90Blocks({
        ar_aging_over_90: Number(latest.ar_aging_over_90),
        as_of_date: latest.as_of_date,
      }),
    });
    if ("sent" in result && result.sent) summary.ar.sent++;
    else summary.ar.skipped++;
  }

  return { ok: true, summary, week };
  });
}
