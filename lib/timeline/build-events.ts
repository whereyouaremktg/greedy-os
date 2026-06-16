import { getArrivalPillVariant } from "@/lib/manufacturing/dates";
import type { ManufacturingStage } from "@/lib/manufacturing/stages";
import { urgencyForDate } from "@/lib/timeline/urgency";
import { humanizeStatus } from "@/lib/timeline/utils";
import type {
  TimelineEvent,
  TimelineEventMeta,
  TimelineUrgency,
} from "@/lib/timeline/types";

type RunRow = {
  id: string;
  product_name: string;
  variant: string | null;
  quantity: number;
  stage: ManufacturingStage;
  expected_completion_date: string | null;
  expected_arrival_date: string | null;
  actual_completion_date: string | null;
  actual_arrival_date: string | null;
  vendor_name: string;
};

type PoRow = {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  vendor_name: string;
};

type PoLineRow = {
  id: string;
  purchase_order_id: string;
  product_name: string;
  color: string | null;
  quantity: number;
  cancel_date: string | null;
  po_number: string | null;
  vendor_name: string;
};

type PaymentRow = {
  id: string;
  purchase_order_id: string;
  label: string;
  amount: number;
  paid: boolean;
  due_date: string | null;
  paid_date: string | null;
  po_number: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

type TaskRow = {
  id: string;
  campaign_id: string;
  title: string;
  status: string;
  owner: string | null;
  due_date: string | null;
  campaign_name: string;
};

type DealRow = {
  id: string;
  deal_name: string;
  stage: string;
  close_date: string | null;
  amount: number | null;
  state: string | null;
};

function arrivalUrgency(
  date: string | null,
  stage: ManufacturingStage,
): TimelineUrgency {
  if (!date || stage === "received") return "neutral";
  return getArrivalPillVariant(date, stage);
}

function meta(
  pairs: Array<[label: string, value: string | number | null | undefined]>,
): TimelineEventMeta[] {
  return pairs
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => ({ label, value: String(value) }));
}

function subtitleFromMeta(items: TimelineEventMeta[]): string | undefined {
  if (items.length === 0) return undefined;
  return items.map((m) => m.value).join(" · ");
}

function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatCount(n: number): string {
  return `${n.toLocaleString()} unit${n === 1 ? "" : "s"}`;
}

export function buildManufacturingEvents(runs: RunRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const run of runs) {
    const accent = formatCount(run.quantity);
    const baseMeta = meta([
      ["Vendor", run.vendor_name],
      ["Variant", run.variant],
      ["Quantity", accent],
      ["Stage", humanizeStatus(run.stage)],
    ]);

    function push(
      suffix: string,
      date: string,
      label: string,
      urgency: TimelineUrgency,
    ) {
      events.push({
        id: `run-${run.id}-${suffix}`,
        category: "manufacturing",
        kind: "milestone",
        date,
        title: run.product_name,
        subtitle: subtitleFromMeta(baseMeta),
        accent,
        meta: baseMeta,
        label,
        status: run.stage,
        urgency,
        href: "/manufacturing",
      });
    }

    if (run.expected_arrival_date) {
      push(
        "arrival-expected",
        run.expected_arrival_date,
        "Expected arrival",
        arrivalUrgency(run.expected_arrival_date, run.stage),
      );
    }
    if (run.actual_arrival_date) {
      push(
        "arrival-actual",
        run.actual_arrival_date,
        "Arrived",
        "neutral",
      );
    }
    if (run.expected_completion_date) {
      push(
        "completion-expected",
        run.expected_completion_date,
        "Expected completion",
        urgencyForDate(run.expected_completion_date),
      );
    }
    if (run.actual_completion_date) {
      push(
        "completion-actual",
        run.actual_completion_date,
        "Completed",
        "neutral",
      );
    }
  }

  return events;
}

export function buildPurchaseOrderEvents(pos: PoRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const po of pos) {
    // Lead with the buyer (REVOLVE, Anthropologie, JillyBox…) so the lane is
    // scannable even when the bar truncates.
    const title = po.po_number
      ? `${po.vendor_name} · PO ${po.po_number}`
      : po.vendor_name;
    const baseMeta = meta([
      ["Vendor", po.vendor_name],
      ["Status", humanizeStatus(po.status)],
    ]);

    if (po.order_date) {
      events.push({
        id: `po-${po.id}-ordered`,
        category: "purchase_order",
        kind: "milestone",
        date: po.order_date,
        title,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Order placed",
        status: po.status,
        href: "/purchase-orders",
      });
    }

    if (po.expected_date) {
      events.push({
        id: `po-${po.id}-expected`,
        category: "purchase_order",
        kind: "milestone",
        date: po.expected_date,
        title,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Latest cancel date",
        status: po.status,
        urgency: urgencyForDate(po.expected_date),
        href: "/purchase-orders",
      });
    }
  }

  return events;
}

export function buildPoLineCancelEvents(lines: PoLineRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const line of lines) {
    if (!line.cancel_date) continue;

    const poLabel = line.po_number ? `PO ${line.po_number}` : "Purchase order";
    const accent = formatCount(line.quantity);
    const baseMeta = meta([
      ["PO", poLabel],
      ["Vendor", line.vendor_name],
      ["Color", line.color],
      ["Quantity", accent],
    ]);

    events.push({
      id: `po-line-${line.id}-cancel`,
      category: "purchase_order",
      kind: "milestone",
      date: line.cancel_date,
      title: line.product_name,
      subtitle: subtitleFromMeta(baseMeta),
      accent,
      meta: baseMeta,
      label: "Cancel date",
      urgency: urgencyForDate(line.cancel_date),
      href: "/purchase-orders",
    });
  }

  return events;
}

export function buildPaymentEvents(payments: PaymentRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const p of payments) {
    const poLabel = p.po_number ? `PO ${p.po_number}` : "Purchase order";
    const accent = formatUsd(p.amount);
    const paymentType = humanizeStatus(p.label);
    const baseMeta = meta([
      ["Purchase order", poLabel],
      ["Type", paymentType],
      ["Amount", accent],
    ]);

    if (!p.paid && p.due_date) {
      events.push({
        id: `payment-${p.id}-due`,
        category: "payment",
        kind: "milestone",
        date: p.due_date,
        title: `${paymentType} due`,
        subtitle: subtitleFromMeta(baseMeta),
        accent,
        meta: baseMeta,
        label: "Payment due",
        status: "unpaid",
        urgency: urgencyForDate(p.due_date, { soonDays: 14 }),
        href: "/purchase-orders",
      });
    }

    if (p.paid && p.paid_date) {
      events.push({
        id: `payment-${p.id}-paid`,
        category: "payment",
        kind: "milestone",
        date: p.paid_date,
        title: `${paymentType} paid`,
        subtitle: subtitleFromMeta(baseMeta),
        accent,
        meta: baseMeta,
        label: "Payment made",
        status: "paid",
        urgency: "neutral",
        href: "/purchase-orders",
      });
    }
  }

  return events;
}

export function buildCampaignEvents(campaigns: CampaignRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const c of campaigns) {
    const baseMeta = meta([
      ["Type", humanizeStatus(c.type)],
      ["Status", humanizeStatus(c.status)],
    ]);

    if (c.start_date && c.end_date) {
      events.push({
        id: `campaign-${c.id}-window`,
        category: "campaign",
        kind: "range",
        date: c.start_date,
        endDate: c.end_date,
        title: c.name,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Campaign window",
        status: c.status,
        href: "/campaigns",
      });
    } else if (c.start_date) {
      events.push({
        id: `campaign-${c.id}-start`,
        category: "campaign",
        kind: "milestone",
        date: c.start_date,
        title: c.name,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Campaign starts",
        status: c.status,
        href: "/campaigns",
      });
    } else if (c.end_date) {
      events.push({
        id: `campaign-${c.id}-end`,
        category: "campaign",
        kind: "milestone",
        date: c.end_date,
        title: c.name,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Campaign ends",
        status: c.status,
        urgency: urgencyForDate(c.end_date),
        href: "/campaigns",
      });
    }
  }

  return events;
}

export function buildCampaignTaskEvents(tasks: TaskRow[]): TimelineEvent[] {
  return tasks
    .filter((t) => t.due_date)
    .map((t) => {
      const baseMeta = meta([
        ["Campaign", t.campaign_name],
        ["Owner", t.owner],
        ["Status", humanizeStatus(t.status)],
      ]);
      return {
        id: `task-${t.id}`,
        category: "campaign_task" as const,
        kind: "milestone" as const,
        date: t.due_date!,
        title: t.title,
        subtitle: subtitleFromMeta(baseMeta),
        meta: baseMeta,
        label: "Task due",
        status: t.status,
        urgency:
          t.status === "done"
            ? ("neutral" as const)
            : urgencyForDate(t.due_date),
        href: "/campaigns",
      };
    });
}

export function buildDealEvents(deals: DealRow[]): TimelineEvent[] {
  return deals
    .filter((d) => d.close_date)
    .map((d) => {
      const accent = d.amount != null ? formatUsd(d.amount) : undefined;
      const baseMeta = meta([
        ["Stage", humanizeStatus(d.stage)],
        ["State", d.state],
        ["Amount", accent],
      ]);
      return {
        id: `deal-${d.id}`,
        category: "deal" as const,
        kind: "milestone" as const,
        date: d.close_date!,
        title: d.deal_name,
        subtitle: subtitleFromMeta(baseMeta),
        accent,
        meta: baseMeta,
        label: "Close date",
        status: d.stage,
        urgency: urgencyForDate(d.close_date),
      };
    });
}

export function mergeTimelineEvents(
  ...groups: TimelineEvent[][]
): TimelineEvent[] {
  const byId = new Map<string, TimelineEvent>();
  for (const group of groups) {
    for (const e of group) {
      byId.set(e.id, e);
    }
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}
