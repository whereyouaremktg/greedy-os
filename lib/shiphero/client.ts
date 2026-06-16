import "server-only";
import { getShipHeroAccessToken } from "@/lib/shiphero/auth";

// Minimal ShipHero GraphQL client.
//
// ShipHero meters by query-complexity CREDITS, not request rate: every response
// carries extensions.throttling.user_quota.credits_remaining and the bucket
// refills over time. Over-fetch and you get throttled. So this client:
//   - keeps page sizes modest,
//   - reads remaining credits after each page and sleeps when low,
//   - retries transient throttle/5xx responses with backoff.

const GRAPHQL_URL = "https://public-api.shiphero.com/graphql";

// Sleep before the next page when remaining credits dip below this.
const CREDIT_FLOOR = 250;
const MAX_RETRIES = 4;

type Throttling = {
  user_quota?: {
    credits_remaining?: number;
    max_available?: number;
    increment_rate?: number;
  };
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; code?: string | number }>;
  extensions?: { throttling?: Throttling };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottleError(errors: GraphQLResponse<unknown>["errors"]): boolean {
  return Boolean(
    errors?.some((e) => /throttl|rate.?limit|complexity/i.test(e.message)),
  );
}

// One GraphQL request with retry on throttle / 5xx. Returns the parsed data and
// the throttling block so callers can pace pagination.
export async function shipHeroRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data: T; throttling?: Throttling }> {
  const token = await getShipHeroAccessToken();

  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });

    if (res.status === 429 || res.status >= 500) {
      lastErr = `HTTP ${res.status}`;
      await sleep(Math.min(30_000, 2_000 * 2 ** attempt));
      continue;
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      if (isThrottleError(json.errors) && attempt < MAX_RETRIES) {
        lastErr = json.errors.map((e) => e.message).join("; ");
        await sleep(Math.min(30_000, 2_000 * 2 ** attempt));
        continue;
      }
      throw new Error(
        `ShipHero GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }

    if (!json.data) {
      throw new Error("ShipHero GraphQL returned no data");
    }
    return { data: json.data, throttling: json.extensions?.throttling };
  }

  throw new Error(`ShipHero GraphQL failed after retries: ${lastErr}`);
}

// Pace pagination based on remaining credits. Sleeps just long enough for the
// bucket to climb back over the floor at its advertised increment rate.
export async function throttleGuard(throttling?: Throttling): Promise<void> {
  const q = throttling?.user_quota;
  if (!q || q.credits_remaining == null) return;
  if (q.credits_remaining >= CREDIT_FLOOR) return;
  const rate = q.increment_rate && q.increment_rate > 0 ? q.increment_rate : 60;
  const deficit = CREDIT_FLOOR - q.credits_remaining;
  const seconds = Math.min(30, Math.ceil(deficit / rate));
  await sleep(Math.max(1, seconds) * 1000);
}

export type ConnectionPage<TNode> = {
  edges: Array<{ cursor?: string; node: TNode }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

// Walk a ShipHero connection to exhaustion (or maxPages), pacing on credits.
// buildQuery receives the current cursor; extract pulls the connection page out
// of the response shape.
export async function paginate<TData, TNode>(opts: {
  buildQuery: (cursor: string | null) => {
    query: string;
    variables?: Record<string, unknown>;
  };
  extract: (data: TData) => ConnectionPage<TNode> | null;
  maxPages?: number;
}): Promise<TNode[]> {
  const maxPages = opts.maxPages ?? 200;
  const nodes: TNode[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const { query, variables } = opts.buildQuery(cursor);
    const { data, throttling } = await shipHeroRequest<TData>(query, variables);
    const conn = opts.extract(data);
    if (!conn) break;

    for (const edge of conn.edges) nodes.push(edge.node);

    if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
    cursor = conn.pageInfo.endCursor;
    await throttleGuard(throttling);
  }

  return nodes;
}
