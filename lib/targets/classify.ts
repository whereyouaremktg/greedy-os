// Pure order classification for the Q4 Targets dashboard.
//
// Every Shopify order in the Q4 window lands in exactly one bucket. Revenue
// buckets (dtc, b2b, mp_*) count toward the Q4 total; excluded buckets are kept
// so nothing is hidden (seeding is shown as a marketing line, not revenue).
//
// Rule order matters and is documented in STAGE notes / HANDOFF:
//   1. test orders                      -> excluded_test
//   2. cancelled                        -> excluded_cancelled
//   3. not paid                         -> excluded_unpaid
//   4. seeding tag OR 100% discounted   -> excluded_seeding
//   5. B2B tag                          -> b2b (its own section)
//   6. excluded channel (Draft Orders,
//      ShopMy, LTK, Shopify Mobile ...) -> excluded_channel
//   7. marketplace channel              -> mp_ulta | mp_tiktok | mp_shop | mp_meta
//   8. Online Store / known storefronts -> dtc
//   9. anything else                    -> dtc_other (shown with its raw channel)
//
// No I/O here. Unit-tested in tests/targets/classify.test.ts.

export const REVENUE_BUCKETS = [
  "dtc",
  "dtc_other",
  "b2b",
  "mp_ulta",
  "mp_tiktok",
  "mp_shop",
  "mp_meta",
] as const;

export const EXCLUDED_BUCKETS = [
  "excluded_seeding",
  "excluded_channel",
  "excluded_unpaid",
  "excluded_cancelled",
  "excluded_test",
] as const;

export type RevenueBucket = (typeof REVENUE_BUCKETS)[number];
export type ExcludedBucket = (typeof EXCLUDED_BUCKETS)[number];
export type Bucket = RevenueBucket | ExcludedBucket;

export const BUCKET_LABELS: Record<Bucket, string> = {
  dtc: "DTC (Online Store)",
  dtc_other: "DTC (other storefronts)",
  b2b: "B2B (Shopify)",
  mp_ulta: "Ulta Marketplace",
  mp_tiktok: "TikTok Shop",
  mp_shop: "Shop app",
  mp_meta: "Meta",
  excluded_seeding: "Seeding / gifting",
  excluded_channel: "Excluded channels",
  excluded_unpaid: "Unpaid",
  excluded_cancelled: "Cancelled",
  excluded_test: "Test orders",
};

export const MARKETPLACE_BUCKETS: RevenueBucket[] = [
  "mp_ulta",
  "mp_tiktok",
  "mp_shop",
  "mp_meta",
];

export type ClassificationRules = {
  /** App / channel names whose orders never count as revenue. Case-insensitive. */
  excludedChannels: string[];
  /** Order tags that mark seeding / gifting. Case-insensitive. */
  seedingTags: string[];
  /** Order tags that mark a B2B order. Case-insensitive. */
  b2bTags: string[];
  /** App / channel name -> marketplace bucket. Case-insensitive keys. */
  marketplaces: Record<string, "mp_ulta" | "mp_tiktok" | "mp_shop" | "mp_meta">;
  /** App / channel names that are our own storefronts (count as dtc). */
  dtcChannels: string[];
  /** SKUs that are not products (shipping protection etc.) — excluded from units. */
  nonProductSkus: string[];
};

export const DEFAULT_RULES: ClassificationRules = {
  excludedChannels: [
    "Draft Orders",
    "ShopMy",
    "LTK",
    "Shopify Mobile for iPhone",
    "Shopify Mobile for Android",
    "Shopify Mobile",
    "Shopify Claude Connector App",
    "Corso",
  ],
  seedingTags: ["seeding", "Gifting", "PR"],
  b2bTags: ["B2B", "Wholesale"],
  marketplaces: {
    "Greedy Marketplace Sync": "mp_ulta",
    TikTok: "mp_tiktok",
    Shop: "mp_shop",
    "Facebook & Instagram": "mp_meta",
    "Meta AI and Muse": "mp_meta",
    Facebook: "mp_meta",
    Instagram: "mp_meta",
  },
  dtcChannels: [
    "Online Store",
    "Glow Beauty Hair Headless",
    "Buy Button",
    "Google & YouTube",
  ],
  nonProductSkus: ["CORSOSP"],
};

/** The facts about an order that classification needs. Money in shop currency. */
export type OrderFacts = {
  test: boolean;
  cancelledAt: string | null;
  /** Shopify displayFinancialStatus, e.g. PAID, PENDING, REFUNDED. */
  financialStatus: string | null;
  tags: string[];
  /** app.name — "Online Store", "Draft Orders", "TikTok", ... */
  appName: string | null;
  /** channelInformation.channelDefinition.channelName when present. */
  channelName: string | null;
  /** sourceName — "web", "shopify_draft_order", "tiktok", a numeric app id ... */
  sourceName: string | null;
  /** Gross merchandise before discounts (subtotal + discounts). */
  grossSales: number;
  /** Discounts applied at checkout. */
  discounts: number;
};

export type Classification = {
  bucket: Bucket;
  /** Short machine-readable reason, surfaced in the UI for excluded orders. */
  reason: string;
};

const PAID_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function hasTag(tags: string[], candidates: string[]): string | null {
  const set = new Set(candidates.map(norm));
  for (const t of tags) {
    if (set.has(norm(t))) return t;
  }
  return null;
}

function channelKey(order: OrderFacts): string {
  // Prefer the app name (what Shopify Analytics calls "sales channel"), fall
  // back to the channel definition, then the raw source.
  return order.appName || order.channelName || order.sourceName || "";
}

function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  const k = norm(key);
  for (const [name, value] of Object.entries(map)) {
    if (norm(name) === k) return value;
  }
  return undefined;
}

export function isPaid(financialStatus: string | null): boolean {
  return PAID_STATUSES.has((financialStatus ?? "").toUpperCase());
}

export function classifyOrder(
  order: OrderFacts,
  rules: ClassificationRules = DEFAULT_RULES,
): Classification {
  if (order.test) return { bucket: "excluded_test", reason: "test order" };
  if (order.cancelledAt) {
    return { bucket: "excluded_cancelled", reason: "cancelled" };
  }
  if (!isPaid(order.financialStatus)) {
    return {
      bucket: "excluded_unpaid",
      reason: `financial status ${order.financialStatus ?? "unknown"}`,
    };
  }

  const seedingTag = hasTag(order.tags, rules.seedingTags);
  if (seedingTag) {
    return { bucket: "excluded_seeding", reason: `tag ${seedingTag}` };
  }
  const fullyDiscounted =
    order.grossSales > 0 && order.grossSales - order.discounts <= 0.005;
  if (fullyDiscounted) {
    return { bucket: "excluded_seeding", reason: "100% discount" };
  }

  const b2bTag = hasTag(order.tags, rules.b2bTags);
  if (b2bTag) return { bucket: "b2b", reason: `tag ${b2bTag}` };

  const channel = channelKey(order);
  const channelNorm = norm(channel);
  const sourceNorm = norm(order.sourceName);

  const excludedSet = new Set(rules.excludedChannels.map(norm));
  if (
    excludedSet.has(channelNorm) ||
    sourceNorm === "shopify_draft_order" ||
    sourceNorm === "iphone" ||
    sourceNorm === "android"
  ) {
    return { bucket: "excluded_channel", reason: `channel ${channel || order.sourceName}` };
  }

  const mp = lookup(rules.marketplaces, channel);
  if (mp) return { bucket: mp, reason: `channel ${channel}` };

  const dtcSet = new Set(rules.dtcChannels.map(norm));
  if (dtcSet.has(channelNorm) || sourceNorm === "web") {
    return { bucket: "dtc", reason: `channel ${channel || "web"}` };
  }

  return { bucket: "dtc_other", reason: `channel ${channel || order.sourceName || "unknown"}` };
}

export function isRevenueBucket(bucket: Bucket): bucket is RevenueBucket {
  return (REVENUE_BUCKETS as readonly string[]).includes(bucket);
}

export function isProductSku(
  sku: string | null,
  rules: ClassificationRules = DEFAULT_RULES,
): boolean {
  if (!sku) return true;
  return !rules.nonProductSkus.some((s) => norm(s) === norm(sku));
}
