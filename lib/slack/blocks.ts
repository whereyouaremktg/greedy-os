import type {
  ActionsBlock,
  Block,
  ContextBlock,
  DividerBlock,
  HeaderBlock,
  SectionBlock,
} from "@slack/web-api";

type MrkdwnField = { type: "mrkdwn"; text: string };

export function headerBlock(text: string): HeaderBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: false } };
}

export function sectionBlock(text: string): SectionBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

export function fieldsSection(fields: MrkdwnField[]): SectionBlock {
  return { type: "section", fields };
}

export function field(label: string, value: string): MrkdwnField {
  return { type: "mrkdwn", text: `*${label}:*\n${value}` };
}

export function actionsBlock(
  elements: ActionsBlock["elements"],
): ActionsBlock {
  return { type: "actions", elements };
}

export function linkButton(text: string, url: string) {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text, emoji: false },
    url,
  };
}

export function actionButton(
  text: string,
  actionId: string,
  value: string,
  style?: "primary" | "danger",
) {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text, emoji: false },
    action_id: actionId,
    value,
    ...(style ? { style } : {}),
  };
}

export function dividerBlock(): DividerBlock {
  return { type: "divider" };
}

export function contextBlock(text: string): ContextBlock {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

export function blocks(...items: Block[]): Block[] {
  return items;
}
