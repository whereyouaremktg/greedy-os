import type { Block } from "@slack/web-api";

import { format, parseISO } from "date-fns";

import {
  actionsBlock,
  blocks,
  contextBlock,
  dividerBlock,
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

// Reorder section — every number here comes from the deterministic forecast
// (lib/inventory/forecast). `note` is optional model narration, not a source
// of truth.
export type DigestReorderItem = {
  sku: string;
  productTitle: string;
  status: "order_now" | "order_soon";
  onHand: number;
  orderByDate: string | null;
  reorderQty: number;
  note: string | null;
};

export type DigestDemandDownItem = {
  sku: string;
  productTitle: string;
  yoyGrowth: number | null; // fraction; -0.30 = down 30%
  note: string | null;
};

export type DigestReorder = {
  orderItems: DigestReorderItem[];
  demandDown: DigestDemandDownItem[];
};

function deltaTag(pct: number | null): string {
  if (pct == null) return "";
  const arrow = pct >= 0 ? "▲" : "▼";
  return ` ${arrow} ${Math.abs(pct).toFixed(0)}% vs prior day`;
}

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

// Urgency is typography, not symbols: alert/warn bullets render as normal
// lines (the prompt has the model lead each with a bold status phrase), and
// info bullets drop into small gray context below.
function bulletLines(items: DigestBullet[]): string {
  return items.map((b) => b.text).join("\n");
}

function stockLines(items: DigestStockItem[]): string {
  const lines = items.map((s) => {
    const lead =
      s.quantity < 0
        ? `*Oversold ${s.quantity}*`
        : s.quantity === 0
          ? "*Out of stock*"
          : `*${s.quantity} left*`;
    // Variants often share a product title (and even a variant title), so the
    // SKU is what keeps two "(wholesale)" lines distinguishable.
    const name = s.variantTitle
      ? `${s.productTitle} — ${s.variantTitle}`
      : s.productTitle;
    const sku = s.sku ? ` \`${s.sku}\`` : "";
    return `${lead} — ${name}${sku}`;
  });
  return [...new Set(lines)].join("\n");
}

function reorderLines(items: DigestReorderItem[]): string {
  return items
    .map((it) => {
      const lead = it.status === "order_now" ? "*Order now*" : "*Order soon*";
      const orderBy = it.orderByDate
        ? ` by ${prettyDate(it.orderByDate)}`
        : "";
      const head = `${lead} — ${it.productTitle} \`${it.sku}\`: reorder ${formatCount(it.reorderQty)} units${orderBy} · ${formatCount(it.onHand)} on hand`;
      return it.note ? `${head}\n_${it.note}_` : head;
    })
    .join("\n");
}

function demandDownLines(items: DigestDemandDownItem[]): string {
  return items
    .map((it) => {
      const pct =
        it.yoyGrowth == null
          ? ""
          : ` ${(it.yoyGrowth * 100).toFixed(0)}% YoY`;
      const head = `*Demand down${pct}* — ${it.productTitle} \`${it.sku}\``;
      return it.note ? `${head}\n_${it.note}_` : head;
    })
    .join("\n");
}

// A digest segment: bold title, alert/warn lines as the body, info lines and
// all-clear states as quiet gray context. No emoji, no per-section buttons —
// urgency and hierarchy come from typography alone.
function segment(
  title: string,
  items: DigestBullet[],
  allClear: string,
): Block[] {
  const out: Block[] = [sectionBlock(`*${title}*`)];
  const loud = items.filter((b) => b.urgency !== "info");
  const quiet = items.filter((b) => b.urgency === "info");

  if (loud.length > 0) out.push(sectionBlock(bulletLines(loud)));
  for (const b of quiet) out.push(contextBlock(b.text));
  if (items.length === 0) out.push(contextBlock(`✓ ${allClear}`));

  out.push(dividerBlock());
  return out;
}

export function digestBlocks(input: {
  heading: string;
  dateLabel: string;
  narrative: DigestNarrative;
  sales: DigestSales | null;
  cash: DigestCash | null;
  stock: DigestStockItem[];
  reorder?: DigestReorder;
}): Block[] {
  const { heading, dateLabel, narrative, sales, cash, stock, reorder } = input;

  const out: Block[] = [
    headerBlock(heading),
    contextBlock(`${dateLabel} · Glow OS`),
    sectionBlock(`_${narrative.headline}_`),
    dividerBlock(),
  ];

  // Sales — hero line with the numbers that matter, detail in small gray text.
  if (sales) {
    const hero = [
      `*${formatUsd(sales.revenue)}*${deltaTag(sales.revenueDeltaPct)}`,
      `*${formatCount(sales.orderCount)}* orders`,
      sales.aov != null ? `AOV ${formatUsd(sales.aov, 2)}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");

    const detail = [
      sales.dtcRevenue != null ? `DTC ${formatUsd(sales.dtcRevenue)}` : null,
      sales.wholesaleRevenue != null
        ? `Wholesale ${formatUsd(sales.wholesaleRevenue)} (${formatCount(sales.wholesaleOrderCount ?? 0)} orders)`
        : null,
      sales.conversionRate != null
        ? `${(sales.conversionRate * 100).toFixed(1)}% conv${
            sales.sessions != null
              ? ` of ${formatCount(sales.sessions)} sessions`
              : ""
          }`
        : null,
      sales.newCustomers != null || sales.returningCustomers != null
        ? `${formatCount(sales.newCustomers ?? 0)} new / ${formatCount(sales.returningCustomers ?? 0)} returning`
        : null,
    ]
      .filter(Boolean)
      .join("  ·  ");

    out.push(sectionBlock("*Sales — yesterday*"), sectionBlock(hero));
    if (detail) out.push(contextBlock(detail));
    if (sales.stale) {
      out.push(
        contextBlock(
          `Shopify figures as of ${prettyDate(sales.asOfDate)} — stale`,
        ),
      );
    }
    out.push(dividerBlock());
  }

  // Purchase orders + manufacturing — model-selected items needing attention.
  out.push(
    ...segment("Purchase orders", narrative.purchaseOrders, "No PO actions needed"),
    ...segment("Manufacturing", narrative.manufacturing, "No manufacturing changes"),
  );

  // Stock alerts — only shown when something is low or oversold.
  if (stock.length > 0) {
    out.push(
      sectionBlock("*Stock*"),
      sectionBlock(stockLines(stock)),
      dividerBlock(),
    );
  }

  // Inventory / reorder — deterministic forecast: order_now / order_soon SKUs
  // with computed order-by date + reorder qty, plus demand-down flags.
  if (
    reorder &&
    (reorder.orderItems.length > 0 || reorder.demandDown.length > 0)
  ) {
    const parts: string[] = [];
    if (reorder.orderItems.length > 0) {
      parts.push(reorderLines(reorder.orderItems));
    }
    if (reorder.demandDown.length > 0) {
      parts.push(demandDownLines(reorder.demandDown));
    }
    out.push(
      sectionBlock("*Reorder*"),
      sectionBlock(parts.join("\n")),
      dividerBlock(),
    );
  }

  // Cash — one line; flag stale QuickBooks figures in context.
  if (cash) {
    const ar =
      cash.arOver90 != null && cash.arOver90 > 0
        ? `   ·   AR 90+: ${formatUsd(cash.arOver90)}`
        : "";
    out.push(
      sectionBlock("*Cash*"),
      sectionBlock(`*${formatUsd(cash.cashPosition)}* on hand${ar}`),
    );
    if (cash.stale) {
      out.push(
        contextBlock(
          `QuickBooks figures as of ${prettyDate(cash.asOfDate)} — stale, reconnect in Settings`,
        ),
      );
    }
  }

  // One actions row for the whole briefing, primary first.
  out.push(
    actionsBlock([
      {
        ...linkButton("Open dashboard", glowUrl("/dashboard")),
        style: "primary" as const,
      },
      linkButton("Purchase orders", glowUrl("/purchase-orders")),
    ]),
  );

  // Footer — data freshness at a glance.
  const asOf = [
    sales ? `Sales ${prettyDate(sales.asOfDate)}` : null,
    cash ? `Cash ${prettyDate(cash.asOfDate)}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  out.push(contextBlock(`Glow OS${asOf ? `  ·  ${asOf}` : ""}`));

  return blocks(...out);
}
