import type { ParsedManufacturingOrder } from "@/lib/manufacturing/parse-schema";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";

const SHIPPING_LINE = /\b(shipping|freight|delivery|logistics)\b/i;

export type FreightMode = "air" | "sea";

export type LandedMarginScenario = {
  mode: FreightMode;
  freightUsd: number;
  landedTotalUsd: number;
  landedPerUnitUsd: number;
  marginPerUnitUsd: number | null;
  marginPercent: number | null;
};

export type LandedMarginResult = {
  quantity: number;
  productCostUsd: number;
  sellPricePerUnitUsd: number | null;
  scenarios: LandedMarginScenario[];
};

export function lineItemCostUsd(
  unitPrice: number | undefined,
  quantity: number,
  lineTotal: number | undefined,
): number {
  if (lineTotal != null && lineTotal > 0) return lineTotal;
  if (unitPrice != null && unitPrice >= 0) return unitPrice * quantity;
  return 0;
}

/** Sum PI lines excluding explicit shipping/freight rows on the document. */
export function manufacturingProductCostUsd(
  parsed: ParsedManufacturingOrder,
): number {
  const fromLines = parsed.line_items
    .filter((item) => !SHIPPING_LINE.test(item.description))
    .reduce(
      (sum, item) =>
        sum +
        lineItemCostUsd(
          item.unit_price_usd,
          item.quantity,
          item.line_total_usd,
        ),
      0,
    );

  if (fromLines > 0) return fromLines;
  return parsed.total_amount_usd ?? 0;
}

/** Wholesale revenue per unit (buyer PO total ÷ units). */
export function wholesaleSellPricePerUnit(parsed: ParsedPurchaseOrder): number {
  if (parsed.total_units <= 0) return 0;
  return parsed.total_price / parsed.total_units;
}

export function computeLandedMargin(input: {
  quantity: number;
  productCostUsd: number;
  airFreightUsd?: number;
  seaFreightUsd?: number;
  sellPricePerUnitUsd?: number | null;
}): LandedMarginResult | null {
  const quantity = input.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const productCostUsd = Math.max(0, input.productCostUsd);
  const sell =
    input.sellPricePerUnitUsd != null &&
    Number.isFinite(input.sellPricePerUnitUsd) &&
    input.sellPricePerUnitUsd > 0
      ? input.sellPricePerUnitUsd
      : null;

  const scenarios: LandedMarginScenario[] = [];

  for (const [mode, freight] of [
    ["air", input.airFreightUsd] as const,
    ["sea", input.seaFreightUsd] as const,
  ]) {
    if (freight == null || !Number.isFinite(freight) || freight < 0) continue;

    const landedTotalUsd = productCostUsd + freight;
    const landedPerUnitUsd = landedTotalUsd / quantity;
    let marginPerUnitUsd: number | null = null;
    let marginPercent: number | null = null;

    if (sell != null) {
      marginPerUnitUsd = sell - landedPerUnitUsd;
      marginPercent = sell > 0 ? (marginPerUnitUsd / sell) * 100 : null;
    }

    scenarios.push({
      mode,
      freightUsd: freight,
      landedTotalUsd,
      landedPerUnitUsd,
      marginPerUnitUsd,
      marginPercent,
    });
  }

  if (scenarios.length === 0) return null;

  return {
    quantity,
    productCostUsd,
    sellPricePerUnitUsd: sell,
    scenarios,
  };
}

export function formatCostingNotes(result: LandedMarginResult): string {
  const lines = [
    "Costing (estimated):",
    `Product cost: $${result.productCostUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${result.quantity.toLocaleString()} units)`,
  ];

  if (result.sellPricePerUnitUsd != null) {
    lines.push(
      `Sell price: $${result.sellPricePerUnitUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}/unit`,
    );
  }

  for (const s of result.scenarios) {
    const mode = s.mode === "air" ? "Air" : "Sea";
    const freight = `$${s.freightUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })} freight`;
    const landed = `$${s.landedPerUnitUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/unit landed`;
    if (s.marginPercent != null && s.marginPerUnitUsd != null) {
      lines.push(
        `${mode}: ${freight} → ${landed}, margin $${s.marginPerUnitUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/unit (${s.marginPercent.toFixed(1)}%)`,
      );
    } else {
      lines.push(`${mode}: ${freight} → ${landed}`);
    }
  }

  return lines.join("\n");
}
