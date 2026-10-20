// Pure fulfillment cost model for the Q4 Targets dashboard.
//
// Fulfillment is a cost of goods: every order we ship costs postage (actual,
// from ShipHero labels), a pick/pack fee and packaging (RetroShip rate card,
// entered once in settings). Customers pay some of it back as shipping
// charged on the order. This module turns weekly facts + rates into per-order
// and share-of-net-sales figures and into the weekly 3PL fallback the
// profitability panel uses when no RetroShip invoice has been entered.
//
// Everything is null when the data it needs is missing; nothing is guessed.

export type FulfillmentRates = {
  /** RetroShip pick/pack fee per order (first unit included). */
  pick_pack_per_order: number | null;
  /** Fee per additional unit in the same order. */
  pick_pack_per_extra_unit: number | null;
  /** Box, mailer, dunnage per order. */
  packaging_per_order: number | null;
};

export type FulfillmentWeekFacts = {
  weekStart: string; // Monday, YYYY-MM-DD
  /** Revenue-bucket orders placed that week. */
  orders: number;
  units: number;
  netSales: number;
  /** Σ shipping charged to customers on those orders. */
  shippingCharged: number;
  /** Orders with ≥ 1 matched ShipHero shipment. */
  shippedOrders: number;
  shipments: number;
  /** Σ valid label cost on matched orders. */
  postage: number;
  avgHoursToShip: number | null;
  p50HoursToShip: number | null;
};

export type FulfillmentWeek = FulfillmentWeekFacts & {
  weekEnd: string;
  isCurrent: boolean;
  /** Share of orders that have a matched shipment (0..1). */
  matchRate: number;
  /** Actual postage ÷ matched orders. */
  postagePerOrder: number | null;
  /** Postage extrapolated to every order at the matched rate (null below MIN_MATCH_RATE). */
  postageEstimated: number | null;
  /** Σ pick/pack fees from the rate card, null when no rate is set. */
  pickPack: number | null;
  packaging: number | null;
  /** postageEstimated + pickPack + packaging (whatever is known). */
  fulfillmentCost: number | null;
  fulfillmentPerOrder: number | null;
  /** fulfillmentCost ÷ net sales. */
  fulfillmentPctOfNet: number | null;
  /** shipping charged − postage estimated: what the customer did not cover. */
  netShipping: number | null;
  /** Shipping charged ÷ postage estimated. */
  shippingRecovery: number | null;
  /** Which cost pieces are missing, for the UI's "postage only" notes. */
  missing: Array<"postage" | "pick_pack" | "packaging">;
  /** True when the estimate extrapolates beyond the matched orders. */
  isEstimate: boolean;
};

/** Below this match rate the postage sample is too thin to extrapolate. */
export const MIN_MATCH_RATE = 0.5;

function nz(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

export function computeFulfillmentWeek(
  facts: FulfillmentWeekFacts,
  rates: FulfillmentRates,
  today: string,
): FulfillmentWeek {
  const weekEnd = addDaysIso(facts.weekStart, 6);
  const isCurrent = today >= facts.weekStart && today <= weekEnd;
  const matchRate = facts.orders > 0 ? facts.shippedOrders / facts.orders : 0;
  const postagePerOrder = facts.shippedOrders > 0 ? facts.postage / facts.shippedOrders : null;
  const canEstimate = postagePerOrder != null && matchRate >= MIN_MATCH_RATE;
  const postageEstimated = canEstimate ? postagePerOrder * facts.orders : null;
  const isEstimate = canEstimate && facts.shippedOrders < facts.orders;

  const perOrder = nz(rates.pick_pack_per_order);
  const perExtra = nz(rates.pick_pack_per_extra_unit);
  const pickPack =
    perOrder != null && facts.orders > 0
      ? facts.orders * perOrder + Math.max(0, facts.units - facts.orders) * (perExtra ?? 0)
      : null;
  const pkg = nz(rates.packaging_per_order);
  const packaging = pkg != null && facts.orders > 0 ? facts.orders * pkg : null;

  const missing: FulfillmentWeek["missing"] = [];
  if (postageEstimated == null) missing.push("postage");
  if (pickPack == null) missing.push("pick_pack");
  if (packaging == null) missing.push("packaging");

  const parts = [postageEstimated, pickPack, packaging].filter((v): v is number => v != null);
  const fulfillmentCost = postageEstimated != null && parts.length > 0 ? parts.reduce((s, v) => s + v, 0) : null;
  const fulfillmentPerOrder = fulfillmentCost != null && facts.orders > 0 ? fulfillmentCost / facts.orders : null;
  const fulfillmentPctOfNet = fulfillmentCost != null && facts.netSales > 0 ? fulfillmentCost / facts.netSales : null;
  const netShipping = postageEstimated != null ? facts.shippingCharged - postageEstimated : null;
  const shippingRecovery =
    postageEstimated != null && postageEstimated > 0 ? facts.shippingCharged / postageEstimated : null;

  return {
    ...facts,
    weekEnd,
    isCurrent,
    matchRate,
    postagePerOrder,
    postageEstimated,
    pickPack,
    packaging,
    fulfillmentCost,
    fulfillmentPerOrder,
    fulfillmentPctOfNet,
    netShipping,
    shippingRecovery,
    missing,
    isEstimate,
  };
}

export type FulfillmentQuarter = {
  orders: number;
  units: number;
  netSales: number;
  shippedOrders: number;
  shipments: number;
  matchRate: number;
  shippingCharged: number;
  postage: number;
  postagePerOrder: number | null;
  postageEstimated: number | null;
  pickPack: number | null;
  packaging: number | null;
  fulfillmentCost: number | null;
  fulfillmentPerOrder: number | null;
  fulfillmentPctOfNet: number | null;
  netShipping: number | null;
  shippingRecovery: number | null;
  /** Weighted by orders. */
  avgHoursToShip: number | null;
  /** Median of the weekly medians, weighted by orders (approximation). */
  p50HoursToShip: number | null;
  weeksWithPostage: number;
  weeksWithOrders: number;
  missing: FulfillmentWeek["missing"];
};

/** Quarter-to-date roll-up. Per-order rates are computed on totals, not averaged. */
export function rollupFulfillment(weeks: FulfillmentWeek[]): FulfillmentQuarter {
  const withOrders = weeks.filter((w) => w.orders > 0);
  const sum = (pick: (w: FulfillmentWeek) => number | null) =>
    withOrders.reduce<number | null>((s, w) => {
      const v = pick(w);
      return v == null ? s : (s ?? 0) + v;
    }, null);

  const orders = sum((w) => w.orders) ?? 0;
  const units = sum((w) => w.units) ?? 0;
  const netSales = sum((w) => w.netSales) ?? 0;
  const shippedOrders = sum((w) => w.shippedOrders) ?? 0;
  const shipments = sum((w) => w.shipments) ?? 0;
  const shippingCharged = sum((w) => w.shippingCharged) ?? 0;
  const postage = sum((w) => w.postage) ?? 0;
  const matchRate = orders > 0 ? shippedOrders / orders : 0;
  const postagePerOrder = shippedOrders > 0 ? postage / shippedOrders : null;
  // Estimate on the quarter's own match rate so a thin early week cannot swing it.
  const postageEstimated = postagePerOrder != null && matchRate >= MIN_MATCH_RATE ? postagePerOrder * orders : null;
  const pickPack = sum((w) => w.pickPack);
  const packaging = sum((w) => w.packaging);
  const parts = [postageEstimated, pickPack, packaging].filter((v): v is number => v != null);
  const fulfillmentCost = postageEstimated != null ? parts.reduce((s, v) => s + v, 0) : null;

  const weighted = (pick: (w: FulfillmentWeek) => number | null) => {
    let num = 0;
    let den = 0;
    for (const w of withOrders) {
      const v = pick(w);
      if (v == null) continue;
      num += v * w.orders;
      den += w.orders;
    }
    return den > 0 ? num / den : null;
  };

  const missing: FulfillmentWeek["missing"] = [];
  if (postageEstimated == null) missing.push("postage");
  if (pickPack == null) missing.push("pick_pack");
  if (packaging == null) missing.push("packaging");

  return {
    orders,
    units,
    netSales,
    shippedOrders,
    shipments,
    matchRate,
    shippingCharged,
    postage,
    postagePerOrder,
    postageEstimated,
    pickPack,
    packaging,
    fulfillmentCost,
    fulfillmentPerOrder: fulfillmentCost != null && orders > 0 ? fulfillmentCost / orders : null,
    fulfillmentPctOfNet: fulfillmentCost != null && netSales > 0 ? fulfillmentCost / netSales : null,
    netShipping: postageEstimated != null ? shippingCharged - postageEstimated : null,
    shippingRecovery: postageEstimated != null && postageEstimated > 0 ? shippingCharged / postageEstimated : null,
    avgHoursToShip: weighted((w) => w.avgHoursToShip),
    p50HoursToShip: weighted((w) => w.p50HoursToShip),
    weeksWithPostage: withOrders.filter((w) => w.postageEstimated != null).length,
    weeksWithOrders: withOrders.length,
    missing,
  };
}

/**
 * The weekly 3PL figure the profitability panel falls back to when no
 * RetroShip invoice is entered: the full fulfillment estimate when the rate
 * card is set, otherwise postage alone (still better than a blank).
 */
export function threeplFallback(week: FulfillmentWeek): number | null {
  return week.fulfillmentCost ?? week.postageEstimated ?? null;
}

// Local copy to keep this module dependency-free for tests.
function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
