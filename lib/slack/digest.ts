import type { Block } from "@slack/web-api";

import {
  actionsBlock,
  blocks,
  contextBlock,
  dividerBlock,
  field,
  fieldsSection,
  headerBlock,
  linkButton,
  sectionBlock,
} from "@/lib/slack/blocks";
import { glowUrl } from "@/lib/slack/messages";
import { formatCount, formatUsd } from "@/lib/format";

export type DigestSales = {
  asOfDate: string;
  revenue: number;
  dtcRevenue: number | null;
  wholesaleRevenue: number | null;
  orderCount: number;
  wholesaleOrderCount: number | null;
  aov: number | null;
  conversionRate: number | null; // ratio (orders / sessions)
  sessions: number | null;
  newCustomers: number | null;
  returningCustomers: number | null;
  revenueDeltaPct: number | null; // vs the prior day
  stale: boolean;
};

export type DigestCash = {
  asOfDate: string;
  cashPosition: number | null;
  arOver90: number | null;
  stale: boolean;
};

export type DigestBullet = {
  text: string;
  urgency: "alert" | "warn" | "info";
};

export type DigestNarrative = {
  headline: string;
  purchaseOrders: DigestBullet[];
  manufacturing: DigestBullet[];
};

export type DigestStockItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
};

const URGENCY_EMOJI: Record<DigestBullet["urgency"], string> = {
  alert: "🔴",
  warn: "🟡",
  info: "•",
};

function deltaTag(pct: number | null): string {
  if (pct == null) return "";
  const arrow = pct >= 0 ? "▲" : "▼";
  return `  ${arrow} ${Math.abs(pct).toFixed(0)}% vs prior day`;
}

function bulletLines(items: DigestBullet[], emptyText: string): string {
  if (items.length === 0) return `_${emptyText}_`;
  return items
    .map((b) => `${URGENCY_EMOJI[b.urgency]} ${b.text}`)
    .join("\n");
}

function stockLines(items: DigestStockItem[]): string {
  return items
    .map((s) => {
      const emoji = s.quantity <= 0 ? "🔴" : "🟡";
      const name = s.variantTitle
        ? `${s.productTitle} — ${s.variantTitle}`
        : s.productTitle;
      const qty =
        s.quantity < 0
          ? `${s.quantity} (oversold)`
          : `${s.quantity} left`;
      return `${emoji} ${name}: *${qty}*`;
    })
    .join("\n");
}

export function digestBlocks(input: {
  heading: string;
  dateLabel: string;
  narrative: DigestNarrative;
  sales: DigestSales | null;
  cash: DigestCash | null;
  stock: DigestStockItem[];
}): Block[] {
  const { heading, dateLabel, narrative, sales, cash, stock } = input;

  const out: Block[] = [
    headerBlock(heading),
    contextBlock(dateLabel),
    sectionBlock(narrative.headline),
    dividerBlock(),
  ];

  // Sales — exact figures rendered as a 2-column field grid.
  if (sales) {
    out.push(sectionBlock("*💰 Yesterday's sales*"));
    out.push(
      fieldsSection([
        field(
          "Revenue",
          `${formatUsd(sales.revenue)}${deltaTag(sales.revenueDeltaPct)}`,
        ),
        field("Orders", formatCount(sales.orderCount)),
        field(
          "DTC",
          sales.dtcRevenue == null ? "—" : formatUsd(sales.dtcRevenue),
        ),
        field(
          "Wholesale",
          sales.wholesaleRevenue == null
            ? "—"
            : `${formatUsd(sales.wholesaleRevenue)} · ${formatCount(sales.wholesaleOrderCount ?? 0)} orders`,
        ),
        field("AOV", formatUsd(sales.aov, 2)),
        field(
          "Conversion",
          sales.conversionRate == null
            ? "—"
            : `${(sales.conversionRate * 100).toFixed(1)}%${
                sales.sessions != null
                  ? ` · ${formatCount(sales.sessions)} sessions`
                  : ""
              }`,
        ),
        field(
          "New / returning",
          sales.newCustomers == null && sales.returningCustomers == null
            ? "—"
            : `${formatCount(sales.newCustomers ?? 0)} new · ${formatCount(sales.returningCustomers ?? 0)} returning`,
        ),
      ]),
    );
    if (sales.stale) {
      out.push(contextBlock(`⚠️ Shopify figures as of ${sales.asOfDate}`));
    }
    out.push(dividerBlock());
  }

  // Purchase orders — model-selected, with a link to the board.
  out.push(
    sectionBlock(
      `*📦 Purchase orders*  <${glowUrl("/purchase-orders")}|view>\n${bulletLines(
        narrative.purchaseOrders,
        "No PO actions needed.",
      )}`,
    ),
    dividerBlock(),
  );

  // Manufacturing — model-selected, with a link to the page.
  out.push(
    sectionBlock(
      `*🏭 Manufacturing*  <${glowUrl("/manufacturing")}|view>\n${bulletLines(
        narrative.manufacturing,
        "No manufacturing changes.",
      )}`,
    ),
    dividerBlock(),
  );

  // Stock alerts — only shown when something is low or oversold.
  if (stock.length > 0) {
    out.push(
      sectionBlock(
        `*📦 Stock alerts*  <${glowUrl("/products")}|view>\n${stockLines(stock)}`,
      ),
      dividerBlock(),
    );
  }

  // Cash.
  if (cash) {
    const arLine =
      cash.arOver90 != null && cash.arOver90 > 0
        ? `\nAR 90+: ${formatUsd(cash.arOver90)}`
        : "";
    out.push(
      sectionBlock(
        `*💵 Cash*\n*${formatUsd(cash.cashPosition)}* on hand${arLine}`,
      ),
    );
  }

  // Footer + actions.
  const asOf = [
    sales ? `Sales ${sales.asOfDate}` : null,
    cash ? `Cash ${cash.asOfDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  out.push(
    contextBlock(`${asOf}${asOf ? " · " : ""}Glow OS`),
    actionsBlock([
      linkButton("Open dashboard", glowUrl("/dashboard")),
      linkButton("Purchase orders", glowUrl("/purchase-orders")),
    ]),
  );

  return blocks(...out);
}
