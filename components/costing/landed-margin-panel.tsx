"use client";

import * as React from "react";
import { Plane, Ship } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUsd, formatPercent } from "@/lib/format";
import {
  computeLandedMargin,
  type LandedMarginResult,
} from "@/lib/costing/landed-margin";

function parseUsdInput(raw: string): number | undefined {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

type Props = {
  quantity: number;
  defaultProductCostUsd: number;
  defaultSellPricePerUnitUsd?: number;
  sellPriceLabel?: string;
  productCostLabel?: string;
  onResultChange?: (result: LandedMarginResult | null) => void;
};

export function LandedMarginPanel({
  quantity,
  defaultProductCostUsd,
  defaultSellPricePerUnitUsd,
  sellPriceLabel = "Sell price / unit",
  productCostLabel = "Product / invoice cost (USD)",
  onResultChange,
}: Props) {
  const [productCost, setProductCost] = React.useState(
    defaultProductCostUsd > 0 ? String(defaultProductCostUsd) : "",
  );
  const [airFreight, setAirFreight] = React.useState("");
  const [seaFreight, setSeaFreight] = React.useState("");
  const [sellPrice, setSellPrice] = React.useState(
    defaultSellPricePerUnitUsd != null && defaultSellPricePerUnitUsd > 0
      ? String(defaultSellPricePerUnitUsd)
      : "",
  );

  React.useEffect(() => {
    setProductCost(
      defaultProductCostUsd > 0 ? String(defaultProductCostUsd) : "",
    );
  }, [defaultProductCostUsd]);

  React.useEffect(() => {
    if (
      defaultSellPricePerUnitUsd != null &&
      defaultSellPricePerUnitUsd > 0 &&
      !sellPrice
    ) {
      setSellPrice(String(defaultSellPricePerUnitUsd));
    }
  }, [defaultSellPricePerUnitUsd, sellPrice]);

  const result = React.useMemo(() => {
    const productCostUsd = parseUsdInput(productCost) ?? 0;
    return computeLandedMargin({
      quantity,
      productCostUsd,
      airFreightUsd: parseUsdInput(airFreight),
      seaFreightUsd: parseUsdInput(seaFreight),
      sellPricePerUnitUsd: parseUsdInput(sellPrice),
    });
  }, [quantity, productCost, airFreight, seaFreight, sellPrice]);

  React.useEffect(() => {
    onResultChange?.(result);
  }, [result, onResultChange]);

  const productCostUsd = parseUsdInput(productCost) ?? 0;
  const factoryPerUnit =
    quantity > 0 && productCostUsd > 0 ? productCostUsd / quantity : null;

  return (
    <section className="min-w-0 max-w-full space-y-4 rounded-lg border bg-muted/30 p-4">
      <div>
        <h3 className="text-sm font-semibold">Landed cost &amp; margin</h3>
        <p className="text-xs text-muted-foreground">
          Add air and/or sea freight quotes to back into per-unit landed cost
          and margin. Enter at least one freight amount to see estimates.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="costing-units" className="text-xs">
            Units
          </Label>
          <Input
            id="costing-units"
            className="num bg-background"
            value={quantity.toLocaleString()}
            readOnly
            disabled
          />
        </div>
        {factoryPerUnit != null ? (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Factory / invoice per unit
            </Label>
            <div className="num flex h-9 items-center rounded-md border bg-background px-3 text-sm">
              {formatUsd(factoryPerUnit, 2)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="costing-product" className="text-xs">
            {productCostLabel}
          </Label>
          <Input
            id="costing-product"
            className="num bg-background"
            inputMode="decimal"
            placeholder="0"
            value={productCost}
            onChange={(e) => setProductCost(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costing-air" className="text-xs">
            Air freight (USD)
          </Label>
          <Input
            id="costing-air"
            className="num bg-background"
            inputMode="decimal"
            placeholder="Quote"
            value={airFreight}
            onChange={(e) => setAirFreight(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costing-sea" className="text-xs">
            Sea freight (USD)
          </Label>
          <Input
            id="costing-sea"
            className="num bg-background"
            inputMode="decimal"
            placeholder="Quote"
            value={seaFreight}
            onChange={(e) => setSeaFreight(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="costing-sell" className="text-xs">
            {sellPriceLabel}
          </Label>
          <Input
            id="costing-sell"
            className="num bg-background"
            inputMode="decimal"
            placeholder="DTC or wholesale price"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
          />
        </div>
      </div>

      {result ? (
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {result.scenarios.map((scenario) => (
            <ScenarioCard key={scenario.mode} scenario={scenario} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter product cost and at least one freight quote to calculate landed
          cost per unit and margin.
        </p>
      )}
    </section>
  );
}

function ScenarioCard({
  scenario,
}: {
  scenario: LandedMarginResult["scenarios"][number];
}) {
  const Icon = scenario.mode === "air" ? Plane : Ship;
  const title = scenario.mode === "air" ? "Air" : "Sea";

  return (
    <div className="min-w-0 rounded-md border bg-background p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </div>
      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Freight</dt>
          <dd className="num font-medium">{formatUsd(scenario.freightUsd, 0)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Landed total</dt>
          <dd className="num font-medium">
            {formatUsd(scenario.landedTotalUsd, 0)}
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t pt-1.5">
          <dt className="text-muted-foreground">Per unit landed</dt>
          <dd className="num font-semibold">
            {formatUsd(scenario.landedPerUnitUsd, 2)}
          </dd>
        </div>
        {scenario.marginPerUnitUsd != null && scenario.marginPercent != null ? (
          <>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Margin / unit</dt>
              <dd
                className={`num font-semibold ${
                  scenario.marginPerUnitUsd >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {formatUsd(scenario.marginPerUnitUsd, 2)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Margin %</dt>
              <dd
                className={`num font-semibold ${
                  scenario.marginPercent >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive"
                }`}
              >
                {formatPercent(scenario.marginPercent, 1)}
              </dd>
            </div>
          </>
        ) : (
          <p className="pt-1 text-muted-foreground">
            Add sell price to see margin.
          </p>
        )}
      </dl>
    </div>
  );
}
