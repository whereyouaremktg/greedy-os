import type { Block } from "@slack/web-api";
import {
  actionButton,
  actionsBlock,
  blocks,
  field,
  fieldsSection,
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

type PaymentRow = {
  id: string;
  label: string;
  amount: number;
  due_date: string | null;
  vendorName: string;
  poId: string;
};

export function paymentDueBlocks(
  row: PaymentRow,
  opts: { overdue?: boolean; snoozed?: boolean; paid?: boolean } = {},
): Block[] {
  const title = opts.paid
    ? "PO payment marked paid"
    : opts.overdue
      ? "PO payment overdue"
      : "PO payment due soon";

  const factRows = [
    field("Vendor", row.vendorName),
    field("Amount", formatUsd(row.amount, 2)),
    field("Due", row.due_date ?? "—"),
  ];

  if (opts.paid) {
    return blocks(
      headerBlock(title),
      fieldsSection(factRows),
      sectionBlock("*Status:* Paid"),
    );
  }

  if (opts.snoozed) {
    return blocks(
      headerBlock(title),
      fieldsSection(factRows),
      sectionBlock("*Status:* Snoozed 3 days"),
    );
  }

  return blocks(
    headerBlock(title),
    fieldsSection(factRows),
    actionsBlock([
      linkButton("Open in Glow", glowUrl("/purchase-orders")),
      actionButton("Mark paid", "mark-payment-paid", row.id, "primary"),
      actionButton("Snooze 3d", "snooze-payment", row.id),
    ]),
  );
}

type RunRow = {
  id: string;
  product_name: string;
  stage: string;
  vendorName: string;
};

export function runStageBlocks(row: RunRow): Block[] {
  return blocks(
    headerBlock("Manufacturing run update"),
    fieldsSection([
      field("Product", row.product_name),
      field("Stage", row.stage.replace(/_/g, " ")),
      field("Vendor", row.vendorName),
    ]),
    actionsBlock([linkButton("Open in Glow", glowUrl("/manufacturing"))]),
  );
}

type ArAlertRow = {
  ar_aging_over_90: number;
  as_of_date: string;
};

export function arOver90Blocks(row: ArAlertRow): Block[] {
  return blocks(
    headerBlock("AR 90+ alert"),
    fieldsSection([
      field("AR 90+", formatUsd(row.ar_aging_over_90, 2)),
      field("As of", row.as_of_date),
    ]),
    actionsBlock([linkButton("Open in Glow", glowUrl("/dashboard"))]),
  );
}

export function analystAnswerBlocks(answer: string): Block[] {
  return blocks(sectionBlock(answer));
}

export function analystAnswerWithActionsBlocks(
  answer: string,
  actions: Array<{ id: string; label: string }>,
): Block[] {
  const sections = [sectionBlock(answer)];
  if (actions.length > 0) {
    const lines = actions.map(
      (a) =>
        `• ${a.label} — <${glowUrl(`/manufacturing#${a.id}`)}|Open in Glow>`,
    );
    sections.push(sectionBlock(`*Actions taken*\n${lines.join("\n")}`));
  }
  return blocks(...sections);
}

export function errorBlocks(): Block[] {
  return blocks(
    sectionBlock("I hit an issue — Paul, check logs."),
  );
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
