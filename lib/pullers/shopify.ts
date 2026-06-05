import "server-only";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import { createServiceClient } from "@/lib/supabase/service";

const WINDOW_DAYS = 30;
const ORDERS_PAGE_SIZE = 50;
const LINE_ITEMS_PAGE_SIZE = 25;
const MAX_THROTTLE_RETRIES = 5;
const API_VERSION = "2026-01";

const ORDERS_QUERY = /* GraphQL */ `
  query GlowOsOrdersByDay(
    $query: String!
    $cursor: String
    $first: Int!
    $liFirst: Int!
  ) {
    orders(first: $first, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        createdAt
        tags
        subtotalPriceSet {
          shopMoney {
            amount
          }
        }
        lineItems(first: $liFirst) {
          pageInfo {
            hasNextPage
          }
          nodes {
            sku
            name
            title
            quantity
            discountedTotalSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
    }
  }
`;

type ShopMoney = { amount: string };
type LineItemNode = {
  sku: string | null;
  name: string | null;
  title: string | null;
  quantity: number;
  discountedTotalSet: { shopMoney: ShopMoney } | null;
};
type OrderNode = {
  id: string;
  createdAt: string;
  tags: string[];
  subtotalPriceSet: { shopMoney: ShopMoney } | null;
  lineItems: {
    pageInfo: { hasNextPage: boolean };
    nodes: LineItemNode[];
  };
};
type OrdersQueryData = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: OrderNode[];
  };
};

type ThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};
type QueryCost = {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: ThrottleStatus;
};

type TopProduct = {
  sku: string | null;
  name: string;
  revenue: number;
  units: number;
};

// An order is wholesale (B2B) if any of its tags matches B2B / Wholesale.
const WHOLESALE_TAG_RE = /\b(b2b|wholesale)\b/i;

function isWholesaleOrder(tags: string[] | null | undefined): boolean {
  return (tags ?? []).some((t) => WHOLESALE_TAG_RE.test(t));
}

type ShopifyMetricsRow = {
  as_of_date: string;
  revenue: number;
  order_count: number;
  dtc_revenue: number;
  wholesale_revenue: number;
  wholesale_order_count: number;
  aov: number;
  top_products: TopProduct[];
  synced_at: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isThrottledError(errors: unknown): boolean {
  if (!errors || typeof errors !== "object") return false;
  const e = errors as {
    message?: string;
    graphQLErrors?: Array<{ extensions?: { code?: string } } | undefined>;
  };
  if (e.message && /throttle/i.test(e.message)) return true;
  return Boolean(
    e.graphQLErrors?.some((g) => g?.extensions?.code === "THROTTLED"),
  );
}

function extractCost(extensions: unknown): QueryCost | null {
  if (!extensions || typeof extensions !== "object") return null;
  const ext = extensions as { cost?: QueryCost };
  return ext.cost ?? null;
}

async function requestOrdersPage(
  client: ReturnType<typeof createAdminApiClient>,
  variables: {
    query: string;
    cursor: string | null;
    first: number;
    liFirst: number;
  },
): Promise<{ data: OrdersQueryData; cost: QueryCost | null }> {
  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
    const res = await client.request<OrdersQueryData>(ORDERS_QUERY, {
      variables,
    });

    if (res.errors) {
      if (isThrottledError(res.errors) && attempt < MAX_THROTTLE_RETRIES) {
        const wait = Math.min(1_000 * 2 ** attempt, 30_000);
        await sleep(wait);
        continue;
      }
      throw new Error(
        `Shopify orders query failed: ${res.errors.message ?? JSON.stringify(res.errors.graphQLErrors ?? res.errors)}`,
      );
    }
    if (!res.data) {
      throw new Error("Shopify orders query returned no data");
    }
    return { data: res.data, cost: extractCost(res.extensions) };
  }
  throw new Error("Shopify orders query exhausted throttle retries");
}

async function waitForBudget(cost: QueryCost | null): Promise<void> {
  if (!cost) return;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const headroom = cost.requestedQueryCost;
  if (currentlyAvailable >= headroom) return;
  const need = headroom - currentlyAvailable;
  const waitMs = Math.ceil((need / Math.max(restoreRate, 1)) * 1000);
  await sleep(Math.min(waitMs, 10_000));
}

async function aggregateDay(
  client: ReturnType<typeof createAdminApiClient>,
  dayStart: Date,
  dayEnd: Date,
): Promise<{
  revenue: number;
  orderCount: number;
  dtcRevenue: number;
  wholesaleRevenue: number;
  wholesaleOrderCount: number;
  topProducts: TopProduct[];
}> {
  const queryStr = `created_at:>='${dayStart.toISOString()}' created_at:<'${dayEnd.toISOString()}'`;

  let cursor: string | null = null;
  let revenue = 0;
  let orderCount = 0;
  let wholesaleRevenue = 0;
  let wholesaleOrderCount = 0;
  const productTotals = new Map<string, TopProduct>();

  while (true) {
    const { data, cost } = await requestOrdersPage(client, {
      query: queryStr,
      cursor,
      first: ORDERS_PAGE_SIZE,
      liFirst: LINE_ITEMS_PAGE_SIZE,
    });

    for (const order of data.orders.nodes) {
      const subtotal = parseFloat(
        order.subtotalPriceSet?.shopMoney?.amount ?? "0",
      );
      const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
      revenue += safeSubtotal;
      orderCount += 1;

      if (isWholesaleOrder(order.tags)) {
        wholesaleRevenue += safeSubtotal;
        wholesaleOrderCount += 1;
      }

      for (const li of order.lineItems?.nodes ?? []) {
        const sku = li.sku?.trim() || null;
        const name = li.name || li.title || "(unknown)";
        const key = sku ?? `name:${name}`;
        const lineRev = parseFloat(
          li.discountedTotalSet?.shopMoney?.amount ?? "0",
        );
        const safeRev = Number.isFinite(lineRev) ? lineRev : 0;
        const safeUnits = Number.isFinite(li.quantity) ? li.quantity : 0;

        const existing = productTotals.get(key);
        if (existing) {
          existing.revenue += safeRev;
          existing.units += safeUnits;
        } else {
          productTotals.set(key, {
            sku,
            name,
            revenue: safeRev,
            units: safeUnits,
          });
        }
      }
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
    if (!cursor) break;

    await waitForBudget(cost);
  }

  const topProducts = [...productTotals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      revenue: round2(p.revenue),
      units: p.units,
    }));

  return {
    revenue,
    orderCount,
    dtcRevenue: revenue - wholesaleRevenue,
    wholesaleRevenue,
    wholesaleOrderCount,
    topProducts,
  };
}

export async function runShopifyPull(): Promise<{ ok: true; rows: number }> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  if (!domain) {
    throw new Error(
      "Shopify credentials missing: SHOPIFY_STORE_DOMAIN is not set",
    );
  }

  const accessToken = await resolveShopifyAccessToken(domain);

  const client = createAdminApiClient({
    storeDomain: domain,
    apiVersion: API_VERSION,
    accessToken,
    retries: 2,
  });

  const today = startOfUtcDay(new Date());
  const syncedAt = new Date().toISOString();
  const rows: ShopifyMetricsRow[] = [];

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const dayStart = new Date(today);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const {
      revenue,
      orderCount,
      dtcRevenue,
      wholesaleRevenue,
      wholesaleOrderCount,
      topProducts,
    } = await aggregateDay(client, dayStart, dayEnd);

    const roundedRevenue = round2(revenue);
    const aov = orderCount > 0 ? round2(roundedRevenue / orderCount) : 0;

    rows.push({
      as_of_date: isoDate(dayStart),
      revenue: roundedRevenue,
      order_count: orderCount,
      dtc_revenue: round2(dtcRevenue),
      wholesale_revenue: round2(wholesaleRevenue),
      wholesale_order_count: wholesaleOrderCount,
      aov,
      top_products: topProducts,
      synced_at: syncedAt,
    });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("shopify_metrics")
    .upsert(rows, { onConflict: "as_of_date" });

  if (error) throw new Error(`shopify_metrics upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
