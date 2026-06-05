import { loadForecastInputs } from "@/lib/inventory/load";
import {
  forecastAll,
  type ForecastStatus,
  type SkuForecast,
} from "@/lib/inventory/forecast";
import { OrderSummaryBanner } from "@/components/inventory/order-summary-banner";
import { ForecastTable } from "@/components/inventory/forecast-table";

// Urgent-first ordering: order_now → order_soon → watch → comfortable →
// demand_down → insufficient_data. Within a status, soonest order-by wins.
const STATUS_RANK: Record<ForecastStatus, number> = {
  order_now: 0,
  order_soon: 1,
  watch: 2,
  comfortable: 3,
  demand_down: 4,
  insufficient_data: 5,
};

function urgentFirst(a: SkuForecast, b: SkuForecast): number {
  const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (rank !== 0) return rank;
  // Soonest order-by date first; nulls last.
  const aBy = a.orderByDate ? Date.parse(a.orderByDate) : Infinity;
  const bBy = b.orderByDate ? Date.parse(b.orderByDate) : Infinity;
  if (aBy !== bBy) return aBy - bBy;
  return b.reorderQty - a.reorderQty;
}

export default async function InventoryPage() {
  const inputs = await loadForecastInputs();
  const forecasts = forecastAll(inputs, { asOf: new Date() }).sort(urgentFirst);

  return (
    <div className="min-w-0 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Growth-aware reorder forecast across every SKU with demand. Sorted by
          urgency.
        </p>
      </header>

      <OrderSummaryBanner forecasts={forecasts} />

      <ForecastTable forecasts={forecasts} />
    </div>
  );
}
