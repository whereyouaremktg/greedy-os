// Shopify order sync for the Q4 Targets dashboard.
//
// Framework-free on purpose: the Next cron route, the manual "Refresh" server
// action and scripts/targets-sync.ts (used for the sandbox backfill) all call
// syncShopifyOrders() with their own client + db + time budget.
//
// Design:
//   * One "window" per tracked quarter (Q4 2025 baseline, Q4 2026). Each keeps
//     a watermark in targets_sync_state. Orders are pulled sorted by
//     UPDATED_AT ascending with `updated_at:>=watermark`, so a run that hits
//     its time budget simply resumes next time, and edits / refunds /
//     fulfillments after the first pass are picked up incrementally.
//   * Page size adapts to Shopify's per-query cost cap and the throttle
//     bucket is respected between pages.
//   * Every order is classified by lib/targets/classify.ts at write time; the
//     bucket is stored so reads are a cheap GROUP BY.

import {
  classifyOrder,
  isProductSku,
  DEFAULT_RULES,
  type ClassificationRules,
} from "@/lib/targets/classify";
import { localDay, q4Window, STORE_TZ } from "@/lib/targets/dates";

export type SyncWindow = {
  key: string; // "q4_2025" | "q4_2026"
  startUtc: string;
  endUtcExclusive: string;
};

export function defaultWindows(now: Date = new Date(), tz = STORE_TZ): SyncWindow[] {
  const year = Number(localDay(now, tz).slice(0, 4));
  // Baseline year + current year. Before October the "current" quarter is
  // still this year's Q4 (empty until it starts), which is fine.
  return [
    { key: `q4_${year - 1}`, ...q4Window(year - 1, tz) },
    { key: `q4_${year}`, ...q4Window(year, tz) },
  ].map((w) => ({ key: w.key, startUtc: w.startUtc, endUtcExclusive: w.endUtcExclusive }));
}

// ----- Shopify shapes (only what we read) -----
type Money = { shopMoney: { amount: string } } | null;
type LineItemNode = {
  sku: string | null;
  name: string | null;
  title: string | null;
  variantTitle: string | null;
  quantity: number;
  currentQuantity: number;
  product: { id: string } | null;
  variant: { id: string } | null;
  originalTotalSet: Money;
  discountedTotalSet: Money;
};
export type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  updatedAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  tags: string[];
  sourceName: string | null;
  app: { name: string | null } | null;
  channelInformation: { channelDefinition: { channelName: string | null } | null } | null;
  customer: { numberOfOrders: string | number | null } | null;
  subtotalPriceSet: Money;
  currentSubtotalPriceSet: Money;
  totalDiscountsSet: Money;
  totalShippingPriceSet: Money;
  totalTaxSet: Money;
  currentTotalPriceSet: Money;
  fulfillments: Array<{ createdAt: string; status: string | null }>;
  lineItems: { pageInfo: { hasNextPage: boolean }; nodes: LineItemNode[] };
};
type OrdersData = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyOrderNode[];
  };
};
type QueryCost = {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
};

export const ORDERS_QUERY = /* GraphQL */ `
  query TargetsOrders($query: String!, $cursor: String, $first: Int!, $liFirst: Int!) {
    orders(first: $first, after: $cursor, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name createdAt processedAt updatedAt cancelledAt test
        displayFinancialStatus displayFulfillmentStatus
        tags sourceName
        app { name }
        channelInformation { channelDefinition { channelName } }
        customer { numberOfOrders }
        subtotalPriceSet { shopMoney { amount } }
        currentSubtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        fulfillments(first: 5) { createdAt status }
        lineItems(first: $liFirst) {
          pageInfo { hasNextPage }
          nodes {
            sku name title variantTitle quantity currentQuantity
            product { id } variant { id }
            originalTotalSet { shopMoney { amount } }
            discountedTotalSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

// ----- Dependencies -----
export type GraphQLResult<T> = {
  data?: T;
  errors?: { message?: string; graphQLErrors?: Array<{ message?: string; extensions?: { code?: string } }> } | Array<{ message?: string }>;
  extensions?: { cost?: QueryCost };
};
export type ShopifyLike = {
  request<T>(query: string, opts: { variables: Record<string, unknown> }): Promise<GraphQLResult<T>>;
};

type WriteResult = { error: { message: string } | null };
type SelectResult<T> = { data: T | null; error: { message: string } | null };
/** Minimal subset of supabase-js we use, so typed and untyped clients both fit. */
export type DbLike = {
  from(table: string): {
    upsert(rows: unknown[] | Record<string, unknown>, opts?: { onConflict?: string }): PromiseLike<WriteResult>;
    insert(rows: unknown[] | Record<string, unknown>): {
      select(cols?: string): { single(): PromiseLike<SelectResult<{ id: number }>> };
    } & PromiseLike<WriteResult>;
    update(values: Record<string, unknown>): { eq(col: string, val: unknown): PromiseLike<WriteResult> };
    delete(): { in(col: string, vals: unknown[]): PromiseLike<WriteResult> };
    select(cols?: string): {
      eq(col: string, val: unknown): { maybeSingle(): PromiseLike<SelectResult<{ value: unknown }>> };
    };
  };
};

export type SyncOptions = {
  windows?: SyncWindow[];
  /** Stop paging once this much wall-clock has elapsed; the watermark resumes next run. */
  budgetMs: number;
  trigger: "cron" | "manual" | "backfill";
  rules?: ClassificationRules;
  tz?: string;
  pageSize?: number;
  lineItemsPerOrder?: number;
  now?: () => Date;
  log?: (msg: string) => void;
};

export type SyncSummary = {
  ok: boolean;
  runId: number | null;
  ordersUpserted: number;
  pages: number;
  complete: boolean;
  windows: Array<{ key: string; complete: boolean; watermark: string | null; orders: number }>;
  message: string;
};

type WindowState = { watermark: string | null; complete: boolean; lastRunAt?: string };

const STATE_PREFIX = "shopify_orders:";
// Re-scan this far back from a run's start when it completes, so edits that
// landed while we were paging are not missed next time.
const WATERMARK_SLACK_MS = 10 * 60 * 1000;

function money(m: Money): number {
  const n = parseFloat(m?.shopMoney?.amount ?? "0");
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorText(errors: GraphQLResult<unknown>["errors"]): string {
  if (!errors) return "";
  if (Array.isArray(errors)) return errors.map((e) => e.message ?? "").join("; ");
  const inner = errors.graphQLErrors?.map((g) => g.message ?? "").join("; ");
  return [errors.message, inner].filter(Boolean).join(" | ");
}
function isThrottled(errors: GraphQLResult<unknown>["errors"]): boolean {
  const text = errorText(errors);
  if (/throttl/i.test(text)) return true;
  if (!Array.isArray(errors) && errors?.graphQLErrors?.some((g) => g.extensions?.code === "THROTTLED")) return true;
  return false;
}
function isCostTooHigh(errors: GraphQLResult<unknown>["errors"]): boolean {
  return /exceeds the single query max cost|MAX_COST_EXCEEDED|query cost/i.test(errorText(errors));
}

export function orderToRow(
  o: ShopifyOrderNode,
  rules: ClassificationRules,
  tz: string,
  syncedAt: string,
) {
  const subtotal = money(o.subtotalPriceSet);
  const currentSubtotal = money(o.currentSubtotalPriceSet);
  const discounts = money(o.totalDiscountsSet);
  const gross = round2(subtotal + discounts);
  const returns = round2(Math.max(0, subtotal - currentSubtotal));
  const net = round2(currentSubtotal);

  const lines = (o.lineItems?.nodes ?? []).map((li, idx) => ({
    order_id: o.id,
    line_index: idx,
    sku: li.sku?.trim() || null,
    product_id: li.product?.id ?? null,
    variant_id: li.variant?.id ?? null,
    title: li.title ?? li.name ?? null,
    variant_title: li.variantTitle ?? null,
    quantity: Number.isFinite(li.quantity) ? li.quantity : 0,
    current_quantity: Number.isFinite(li.currentQuantity) ? li.currentQuantity : 0,
    gross: round2(money(li.originalTotalSet)),
    discounted: round2(money(li.discountedTotalSet)),
    is_product: isProductSku(li.sku, rules),
  }));
  const units = lines.filter((l) => l.is_product).reduce((s, l) => s + l.current_quantity, 0);

  const classification = classifyOrder(
    {
      test: o.test,
      cancelledAt: o.cancelledAt,
      financialStatus: o.displayFinancialStatus,
      tags: o.tags ?? [],
      appName: o.app?.name ?? null,
      channelName: o.channelInformation?.channelDefinition?.channelName ?? null,
      sourceName: o.sourceName,
      grossSales: gross,
      discounts,
    },
    rules,
  );

  const successFulfillments = (o.fulfillments ?? [])
    .filter((f) => !f.status || f.status.toUpperCase() === "SUCCESS")
    .map((f) => f.createdAt)
    .sort();
  const processedAt = o.processedAt ?? o.createdAt;
  const customerOrders = o.customer?.numberOfOrders == null ? null : Number(o.customer.numberOfOrders);

  const row = {
    id: o.id,
    name: o.name,
    created_at: o.createdAt,
    processed_at: processedAt,
    updated_at: o.updatedAt,
    cancelled_at: o.cancelledAt,
    day_local: localDay(processedAt, tz),
    financial_status: o.displayFinancialStatus,
    fulfillment_status: o.displayFulfillmentStatus,
    first_fulfilled_at: successFulfillments[0] ?? null,
    source_name: o.sourceName,
    app_name: o.app?.name ?? null,
    channel_name: o.channelInformation?.channelDefinition?.channelName ?? null,
    tags: o.tags ?? [],
    gross_sales: gross,
    discounts: round2(discounts),
    returns,
    net_sales: net,
    shipping: round2(money(o.totalShippingPriceSet)),
    tax: round2(money(o.totalTaxSet)),
    total: round2(money(o.currentTotalPriceSet)),
    units,
    customer_order_count: Number.isFinite(customerOrders as number) ? customerOrders : null,
    bucket: classification.bucket,
    bucket_reason: classification.reason,
    synced_at: syncedAt,
  };
  return { row, lines };
}

async function readState(db: DbLike, key: string): Promise<WindowState> {
  const { data, error } = await db
    .from("targets_sync_state")
    .select("value")
    .eq("key", STATE_PREFIX + key)
    .maybeSingle();
  if (error) throw new Error(`targets_sync_state read: ${error.message}`);
  const v = (data?.value ?? {}) as Partial<WindowState>;
  return { watermark: v.watermark ?? null, complete: Boolean(v.complete), lastRunAt: v.lastRunAt };
}

async function writeState(db: DbLike, key: string, state: WindowState): Promise<void> {
  const { error } = await db
    .from("targets_sync_state")
    .upsert({ key: STATE_PREFIX + key, value: state, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`targets_sync_state write: ${error.message}`);
}

async function requestPage(
  shopify: ShopifyLike,
  variables: { query: string; cursor: string | null; first: number; liFirst: number },
  log?: (m: string) => void,
): Promise<{ data: OrdersData; cost: QueryCost | null; first: number }> {
  let first = variables.first;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await shopify.request<OrdersData>(ORDERS_QUERY, { variables: { ...variables, first } });
    if (res.errors) {
      if (isCostTooHigh(res.errors) && first > 5) {
        first = Math.max(5, Math.floor(first / 2));
        log?.(`query cost too high; page size -> ${first}`);
        continue;
      }
      if (isThrottled(res.errors)) {
        const wait = Math.min(1000 * 2 ** attempt, 20_000);
        log?.(`throttled; waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw new Error(`Shopify orders query failed: ${errorText(res.errors)}`);
    }
    if (!res.data) throw new Error("Shopify orders query returned no data");
    return { data: res.data, cost: res.extensions?.cost ?? null, first };
  }
  throw new Error("Shopify orders query exhausted retries");
}

async function waitForBudget(cost: QueryCost | null): Promise<void> {
  if (!cost) return;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  const need = cost.requestedQueryCost - currentlyAvailable;
  if (need <= 0) return;
  await sleep(Math.min(Math.ceil((need / Math.max(restoreRate, 1)) * 1000), 10_000));
}

export async function syncShopifyOrders(
  deps: { shopify: ShopifyLike; db: DbLike },
  opts: SyncOptions,
): Promise<SyncSummary> {
  const { shopify, db } = deps;
  const now = opts.now ?? (() => new Date());
  const tz = opts.tz ?? STORE_TZ;
  const rules = opts.rules ?? DEFAULT_RULES;
  const windows = opts.windows ?? defaultWindows(now(), tz);
  const log = opts.log;
  const startedAt = now();
  const deadline = startedAt.getTime() + opts.budgetMs;
  let pageSize = opts.pageSize ?? 25;
  const liFirst = opts.lineItemsPerOrder ?? 20;

  // Run record (best-effort: a failure here must not block the sync).
  let runId: number | null = null;
  try {
    const ins = await db
      .from("targets_sync_runs")
      .insert({ job: "shopify_orders", trigger: opts.trigger, started_at: startedAt.toISOString() })
      .select("id")
      .single();
    runId = ins.data?.id ?? null;
  } catch {
    runId = null;
  }

  let ordersUpserted = 0;
  let pages = 0;
  let allComplete = true;
  const windowSummaries: SyncSummary["windows"] = [];
  let message = "";

  try {
    for (const w of windows) {
      const state = await readState(db, w.key);
      let watermark = state.watermark;
      let windowOrders = 0;
      let cursor: string | null = null;
      let windowDone = false;
      const runStartIso = new Date(startedAt.getTime() - WATERMARK_SLACK_MS).toISOString();

      const baseQuery = `created_at:>='${w.startUtc}' created_at:<'${w.endUtcExclusive}'`;
      const query = watermark ? `${baseQuery} updated_at:>='${watermark}'` : baseQuery;
      log?.(`[${w.key}] start (complete=${state.complete}, watermark=${watermark ?? "none"})`);

      let lastUpdatedAt: string | null = null;
      while (true) {
        if (Date.now() > deadline) {
          log?.(`[${w.key}] time budget reached after ${pages} pages; will resume`);
          allComplete = false;
          break;
        }
        const { data, cost, first } = await requestPage(shopify, { query, cursor, first: pageSize, liFirst }, log);
        pageSize = first;
        pages++;
        const syncedAt = now().toISOString();
        const nodes = data.orders.nodes;

        if (nodes.length > 0) {
          const rows = nodes.map((n) => orderToRow(n, rules, tz, syncedAt));
          const orderRows = rows.map((r) => r.row);
          const lineRows = rows.flatMap((r) => r.lines);
          const ids = orderRows.map((r) => r.id);

          const up = await db.from("shopify_orders").upsert(orderRows, { onConflict: "id" });
          if (up.error) throw new Error(`shopify_orders upsert: ${up.error.message}`);
          const del = await db.from("shopify_order_lines").delete().in("order_id", ids);
          if (del.error) throw new Error(`shopify_order_lines clear: ${del.error.message}`);
          if (lineRows.length > 0) {
            const ins = await db.from("shopify_order_lines").insert(lineRows);
            if (ins.error) throw new Error(`shopify_order_lines insert: ${ins.error.message}`);
          }
          ordersUpserted += orderRows.length;
          windowOrders += orderRows.length;
          lastUpdatedAt = nodes[nodes.length - 1].updatedAt;
          // Persist progress so an interrupted run resumes from here.
          watermark = lastUpdatedAt;
          await writeState(db, w.key, { watermark, complete: state.complete, lastRunAt: syncedAt });
        }

        if (!data.orders.pageInfo.hasNextPage || !data.orders.pageInfo.endCursor) {
          windowDone = true;
          break;
        }
        cursor = data.orders.pageInfo.endCursor;
        await waitForBudget(cost);
      }

      if (windowDone) {
        // Everything up to run start is in; next run only needs edits since then.
        watermark = runStartIso;
        await writeState(db, w.key, { watermark, complete: true, lastRunAt: now().toISOString() });
      }
      windowSummaries.push({ key: w.key, complete: windowDone, watermark, orders: windowOrders });
      log?.(`[${w.key}] ${windowDone ? "complete" : "partial"} — ${windowOrders} orders`);
      if (!windowDone) break; // budget exhausted; later windows wait for the next run
    }
    message = windowSummaries.map((s) => `${s.key}: ${s.orders} orders${s.complete ? "" : " (partial)"}`).join("; ");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (runId != null) {
      await db
        .from("targets_sync_runs")
        .update({ finished_at: now().toISOString(), ok: false, orders_upserted: ordersUpserted, pages, complete: false, message: msg.slice(0, 2000) })
        .eq("id", runId);
    }
    throw err;
  }

  if (runId != null) {
    await db
      .from("targets_sync_runs")
      .update({ finished_at: now().toISOString(), ok: true, orders_upserted: ordersUpserted, pages, complete: allComplete, message })
      .eq("id", runId);
  }

  return { ok: true, runId, ordersUpserted, pages, complete: allComplete, windows: windowSummaries, message };
}
