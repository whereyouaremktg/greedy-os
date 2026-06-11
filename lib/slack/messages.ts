import type { Block } from "@slack/web-api";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

import {
  actionButton,
  actionsBlock,
  blocks,
  contextBlock,
  headerBlock,
  linkButton,
  sectionBlock,
} from "@/lib/slack/blocks";
import { formatUsd } from "@/lib/format";

const GLOW_BASE_URL =
  process.env.NEXT_PUBLIC_GLOW_URL ?? "https://glow-os-bay.vercel.app";

export function glowUrl(path: string): string {
  return `${GLOW_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

/** "due today" / "due tomorrow" / "due Jun 13 (in 3 days)" / "5 days late". */
function dueDescriptor(iso: string | null): string {
  if (!iso) return "no due date";
  let days: number;
  try {
    days = differenceInCalendarDays(parseISO(iso), new Date());
  } catch {
    return `due ${iso}`;
  }
  if (days < 0) {
    const late = Math.abs(days);
    return `${late} ${late === 1 ? "day" : "days"} late — was due ${prettyDate(iso)}`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due ${prettyDate(iso)} (in ${days} days)`;
}

type PaymentRow = {
  id: string;
  label: string;
  amount: number;
  due_date: string | null;
  vendorName: string;
  poId: string;
};

// Koala-style: the header carries the whole story (entity + amount + state),
// metadata sits in gray context, one actions row with the primary move first.
export function paymentDueBlocks(
  row: PaymentRow,
  opts: { overdue?: boolean; snoozed?: boolean; paid?: boolean } = {},
): Block[] {
  const state = opts.paid
    ? "payment paid"
    : opts.overdue
      ? "payment overdue"
      : "payment due";
  const header = headerBlock(
    `${row.vendorName} — ${formatUsd(row.amount, 2)} ${state}`,
  );
  const meta = contextBlock(`${row.label} · Purchase order payment · Glow OS`);

  if (opts.paid) {
    return blocks(header, meta, sectionBlock("*Paid* — recorded just now."));
  }

  if (opts.snoozed) {
    return blocks(
      header,
      meta,
      sectionBlock(
        `*Snoozed* — now ${dueDescriptor(row.due_date)}.`,
      ),
    );
  }

  return blocks(
    header,
    meta,
    sectionBlock(`*${capitalize(dueDescriptor(row.due_date))}*`),
    actionsBlock([
      actionButton("Mark paid", "mark-payment-paid", row.id, "primary"),
      actionButton("Snooze 3d", "snooze-payment", row.id),
      linkButton("Open PO", glowUrl(`/purchase-orders#${row.poId}`)),
    ]),
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type RunRow = {
  id: string;
  product_name: string;
  stage: string;
  vendorName: string;
};

const STAGE_HEADLINE: Record<string, string> = {
  in_transit: "now in transit",
  received: "received",
};

export function runStageBlocks(row: RunRow): Block[] {
  const stageLabel =
    STAGE_HEADLINE[row.stage] ?? row.stage.replace(/_/g, " ");
  return blocks(
    headerBlock(`${row.product_name} — ${stageLabel}`),
    contextBlock(`${row.vendorName} · Manufacturing run · Glow OS`),
    actionsBlock([
      linkButton("Open run", glowUrl(`/manufacturing#${row.id}`)),
    ]),
  );
}

type ArAlertRow = {
  ar_aging_over_90: number;
  as_of_date: string;
};

export function arOver90Blocks(row: ArAlertRow): Block[] {
  return blocks(
    headerBlock(
      `AR over 90 days — ${formatUsd(row.ar_aging_over_90, 2)}`,
    ),
    contextBlock(`QuickBooks · as of ${prettyDate(row.as_of_date)} · Glow OS`),
    actionsBlock([linkButton("Open dashboard", glowUrl("/dashboard"))]),
  );
}

export function analystAnswerBlocks(answer: string): Block[] {
  return blocks(sectionBlock(answer));
}

const TOOL_PAGE: Record<string, string> = {
  createVendor: "/vendors",
  createPurchaseOrder: "/purchase-orders",
  createProduct: "/products",
  deactivateProduct: "/products",
  createCampaign: "/campaigns",
  addCampaignTask: "/campaigns",
};

export function analystAnswerWithActionsBlocks(
  answer: string,
  actions: Array<{ id: string; label: string; toolName?: string }>,
): Block[] {
  const out: Block[] = [sectionBlock(answer)];
  // Each completed write becomes a quiet gray receipt line under the answer.
  for (const a of actions) {
    const page = (a.toolName && TOOL_PAGE[a.toolName]) ?? "/manufacturing";
    out.push(
      contextBlock(`✓ ${a.label} · <${glowUrl(`${page}#${a.id}`)}|Open in Glow>`),
    );
  }
  return blocks(...out);
}

export function errorBlocks(
  message = "I hit an issue — Paul, check logs.",
): Block[] {
  return blocks(sectionBlock(message));
}

export function identityNotLinkedBlocks(
  slackUserId: string,
  slackEmail: string | null,
): Block[] {
  const emailLine = slackEmail
    ? `*Your Slack email:* ${slackEmail}`
    : '*Your Slack email:* "(not visible)"';
  const text = [
    "I'm not linked to your Glow OS account yet.",
    `*Your Slack ID:* \`${slackUserId}\``,
    emailLine,
    `Ask Paul to link you at <${glowUrl("/settings")}|Settings → Slack identities>.`,
  ].join("\n");
  return blocks(sectionBlock(text));
}

export function identityNotLinkedText(
  slackUserId: string,
  slackEmail: string | null,
): string {
  const emailPart = slackEmail ?? "(not visible)";
  return [
    "I'm not linked to your Glow OS account yet.",
    `Your Slack ID: ${slackUserId}`,
    `Your Slack email: ${emailPart}`,
    `Ask Paul to link you at ${glowUrl("/settings")} (Settings → Slack identities).`,
  ].join("\n");
}
