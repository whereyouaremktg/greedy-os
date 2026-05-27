import type { ParsedManufacturingOrder } from "@/lib/manufacturing/parse-schema";

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

export type RunCostingInput = {
  product_cost_usd: number;
  sell_price_per_unit_usd: number | null;
  air_freight_usd: number | null;
  sea_freight_usd: number | null;
  air_landed_per_unit_usd: number | null;
  sea_landed_per_unit_usd: number | null;
  air_margin_per_unit_usd: number | null;
  sea_margin_per_unit_usd: number | null;
  air_margin_percent: number | null;
  sea_margin_percent: number | null;
};

function scenarioField(
  result: LandedMarginResult,
  mode: FreightMode,
): LandedMarginScenario | undefined {
  return result.scenarios.find((s) => s.mode === mode);
}

export function landedMarginResultToRunCosting(
  result: LandedMarginResult,
): RunCostingInput {
  const air = scenarioField(result, "air");
  const sea = scenarioField(result, "sea");

  return {
    product_cost_usd: result.productCostUsd,
    sell_price_per_unit_usd: result.sellPricePerUnitUsd,
    air_freight_usd: air?.freightUsd ?? null,
    sea_freight_usd: sea?.freightUsd ?? null,
    air_landed_per_unit_usd: air?.landedPerUnitUsd ?? null,
    sea_landed_per_unit_usd: sea?.landedPerUnitUsd ?? null,
    air_margin_per_unit_usd: air?.marginPerUnitUsd ?? null,
    sea_margin_per_unit_usd: sea?.marginPerUnitUsd ?? null,
    air_margin_percent: air?.marginPercent ?? null,
    sea_margin_percent: sea?.marginPercent ?? null,
  };
}

export function runHasCosting(run: {
  air_freight_usd?: number | null;
  sea_freight_usd?: number | null;
  product_cost_usd?: number | null;
}): boolean {
  return (
    run.air_freight_usd != null ||
    run.sea_freight_usd != null ||
    run.product_cost_usd != null
  );
}

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
