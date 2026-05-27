import "server-only";

import { createAdminApiClient } from "@shopify/admin-api-client";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  upsertProductFromShopify,
  type ShopifyProductInput,
} from "@/lib/products/core";
import { resolveShopifyAccessToken } from "@/lib/shopify/access-token";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

const API_VERSION = "2026-01";
const PAGE_SIZE = 250;
const MAX_THROTTLE_RETRIES = 5;

const PRODUCTS_QUERY = /* GraphQL */ `
  query GlowOsProductCatalog($cursor: String, $first: Int!) {
    products(first: $first, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          productType
          status
          featuredMedia {
            preview {
              image {
                url
              }
            }
          }
          variants(first: 1) {
            edges {
              node {
                sku
              }
            }
          }
        }
      }
    }
  }
`;

type ProductNode = {
  id: string;
  handle: string;
  title: string;
  productType: string | null;
  status: string;
  featuredMedia: {
    preview: { image: { url: string } | null } | null;
  } | null;
  variants: {
    edges: Array<{ node: { sku: string | null } }>;
  };
};

type ProductsQueryData = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ProductNode }>;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForBudget(cost: QueryCost | null): Promise<void> {
  if (!cost) return;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const headroom = cost.requestedQueryCost;
  if (currentlyAvailable >= headroom) return;
  const need = headroom - currentlyAvailable;
  const waitMs = Math.ceil((need / Math.max(restoreRate, 1)) * 1000);
  await sleep(Math.min(waitMs, 10_000));
}

async function requestProductsPage(
  client: ReturnType<typeof createAdminApiClient>,
  cursor: string | null,
): Promise<{ data: ProductsQueryData; cost: QueryCost | null }> {
  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
    const res = await client.request<ProductsQueryData>(PRODUCTS_QUERY, {
      variables: { cursor, first: PAGE_SIZE },
    });

    if (res.errors) {
      if (isThrottledError(res.errors) && attempt < MAX_THROTTLE_RETRIES) {
        const wait = Math.min(1_000 * 2 ** attempt, 30_000);
        await sleep(wait);
        continue;
      }
      throw new Error(
        `Shopify products query failed: ${res.errors.message ?? JSON.stringify(res.errors.graphQLErrors ?? res.errors)}`,
      );
    }
    if (!res.data) {
      throw new Error("Shopify products query returned no data");
    }
    return { data: res.data, cost: extractCost(res.extensions) };
  }
  throw new Error("Shopify products query exhausted throttle retries");
}

function toShopifyProductInput(node: ProductNode): ShopifyProductInput {
  const sku = node.variants.edges[0]?.node.sku?.trim() || null;
  return {
    shopify_product_id: node.id,
    shopify_handle: node.handle,
    name: node.title,
    sku,
    image_url: node.featuredMedia?.preview?.image?.url ?? null,
    category: node.productType?.trim() || null,
    active: node.status === "ACTIVE",
  };
}

async function fetchAllShopifyProducts(): Promise<ShopifyProductInput[]> {
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

  const products: ShopifyProductInput[] = [];
  let cursor: string | null = null;

  while (true) {
    const { data, cost } = await requestProductsPage(client, cursor);

    for (const edge of data.products.edges) {
      products.push(toShopifyProductInput(edge.node));
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    if (!cursor) break;

    await waitForBudget(cost);
  }

  return products;
}

export async function runShopifyProductSync(
  supabase: Client,
  actorUserId: string | null,
): Promise<{ ok: true; synced: number; errors: string[] }> {
  const shopifyProducts = await fetchAllShopifyProducts();
  const errors: string[] = [];
  let synced = 0;

  for (const product of shopifyProducts) {
    const result = await upsertProductFromShopify(
      supabase,
      actorUserId,
      product,
    );
    if (result.ok) {
      synced += 1;
    } else {
      errors.push(`${product.name}: ${result.error.message}`);
    }
  }

  return { ok: true, synced, errors };
}
