import type { Block } from "@slack/web-api";

import { format, parseISO } from "date-fns";

import {
  blocks,
  contextBlock,
  dividerBlock,
  headerBlock,
  linkButton,
  sectionBlock,
  sectionWithAccessory,
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

const URGENCY_EMOJI: Record<DigestBullet["urgency"], string> = {
  alert: "🔴",
  warn: "🟡",
  info: "•",
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

function bulletLines(items: DigestBullet[]): string {
  return items
    .map((b) => `${URGENCY_EMOJI[b.urgency]} ${b.text}`)
    .join("\n");
}

function stockLines(items: DigestStockItem[]): string {
  const lines = items.map((s) => {
    const emoji = s.quantity <= 0 ? "🔴" : "🟡";
    // Variants often share a product title (and even a variant title), so the
    // SKU is what keeps two "(wholesale): 0 left" lines distinguishable.
    const name = s.variantTitle
      ? `${s.productTitle} — ${s.variantTitle}`
      : s.productTitle;
    const sku = s.sku ? ` \`${s.sku}\`` : "";
    const qty =
      s.quantity < 0 ? `${s.quantity} (oversold)` : `${s.quantity} left`;
    return `${emoji} ${name}${sku}: *${qty}*`;
  });
  return [...new Set(lines)].join("\n");
}

function reorderLines(items: DigestReorderItem[]): string {
  return items
    .map((it) => {
      const emoji = it.status === "order_now" ? "🔴" : "🟡";
      const label = it.status === "order_now" ? "ORDER NOW" : "order soon";
      const orderBy = it.orderByDate
        ? ` · order by *${it.orderByDate}*`
        : "";
      const head = `${emoji} *${it.productTitle}* (${it.sku}) — ${label}: reorder *${formatCount(it.reorderQty)}* units${orderBy} · ${formatCount(it.onHand)} on-hand`;
      return it.note ? `${head}\n    _${it.note}_` : head;
    })
    .join("\n");
}

function demandDownLines(items: DigestDemandDownItem[]): string {
  return items
    .map((it) => {
      const pct =
        it.yoyGrowth == null
          ? ""
          : ` (${(it.yoyGrowth * 100).toFixed(0)}% YoY)`;
      const head = `📉 *${it.productTitle}* (${it.sku}) — demand down${pct}`;
      return it.note ? `${head}\n    _${it.note}_` : head;
    })
    .join("\n");
}

/** Bold title row with a right-aligned View button linking into Glow. */
function titleRow(title: string, path: string): Block {
  return sectionWithAccessory(title, linkButton("View", glowUrl(path)));
}

/** Bullets render as a section; an empty list renders as calm gray context. */
function bodyOrAllClear(body: string, allClear: string): Block {
  return body ? sectionBlock(body) : contextBlock(`✓ ${allClear}`);
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
    contextBlock(dateLabel),
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

    out.push(titleRow("*💰 Yesterday's sales*", "/dashboard"));
    out.push(sectionBlock(hero));
    if (detail) out.push(contextBlock(detail));
    if (sales.stale) {
      out.push(
        contextBlock(`⚠️ Shopify figures as of ${prettyDate(sales.asOfDate)}`),
      );
    }
    out.push(dividerBlock());
  }

  // Purchase orders — model-selected items needing attention.
  out.push(
    titleRow("*📦 Purchase orders*", "/purchase-orders"),
    bodyOrAllClear(bulletLines(narrative.purchaseOrders), "No PO actions needed"),
    dividerBlock(),
  );

  // Manufacturing — model-selected run updates.
  out.push(
    titleRow("*🏭 Manufacturing*", "/manufacturing"),
    bodyOrAllClear(
      bulletLines(narrative.manufacturing),
      "No manufacturing changes",
    ),
    dividerBlock(),
  );

  // Stock alerts — only shown when something is low or oversold.
  if (stock.length > 0) {
    out.push(
      titleRow("*🚨 Stock alerts*", "/products"),
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
      parts.push(`*Demand down*\n${demandDownLines(reorder.demandDown)}`);
    }
    out.push(
      titleRow("*📥 Reorder*", "/inventory"),
      sectionBlock(parts.join("\n\n")),
      dividerBlock(),
    );
  }

  // Cash — one line; flag stale QuickBooks figures inline.
  if (cash) {
    const ar =
      cash.arOver90 != null && cash.arOver90 > 0
        ? `   ·   AR 90+: ${formatUsd(cash.arOver90)}`
        : "";
    out.push(
      titleRow("*💵 Cash*", "/dashboard"),
      sectionBlock(`*${formatUsd(cash.cashPosition)}* on hand${ar}`),
    );
    if (cash.stale) {
      out.push(
        contextBlock(
          `⚠️ QuickBooks figures as of ${prettyDate(cash.asOfDate)}`,
        ),
      );
    }
  }

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
