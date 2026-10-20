import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/targets/classify";
import { completeLineItems, orderToRow, LINE_ITEMS_QUERY, type ShopifyLike, type ShopifyOrderNode } from "@/lib/targets/sync";

function line(sku: string, qty: number) {
  return {
    sku,
    name: sku,
    title: sku,
    variantTitle: null,
    quantity: qty,
    currentQuantity: qty,
    product: { id: `gid://shopify/Product/${sku}` },
    variant: { id: `gid://shopify/ProductVariant/${sku}` },
    originalTotalSet: { shopMoney: { amount: String(qty * 10) } },
    discountedTotalSet: { shopMoney: { amount: String(qty * 9) } },
  };
}

function order(lines: ReturnType<typeof line>[], hasNext: boolean, endCursor: string | null): ShopifyOrderNode {
  return {
    id: "gid://shopify/Order/1",
    name: "#90001",
    createdAt: "2026-10-05T17:00:00Z",
    processedAt: "2026-10-05T17:00:00Z",
    updatedAt: "2026-10-05T17:00:00Z",
    cancelledAt: null,
    test: false,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    tags: ["B2B"],
    sourceName: "web",
    app: { name: "Online Store" },
    channelInformation: { channelDefinition: { channelName: "Online Store" } },
    customer: { numberOfOrders: "3" },
    subtotalPriceSet: { shopMoney: { amount: "900" } },
    currentSubtotalPriceSet: { shopMoney: { amount: "900" } },
    totalDiscountsSet: { shopMoney: { amount: "100" } },
    totalShippingPriceSet: { shopMoney: { amount: "0" } },
    totalTaxSet: { shopMoney: { amount: "0" } },
    currentTotalPriceSet: { shopMoney: { amount: "900" } },
    fulfillments: [{ createdAt: "2026-10-06T15:00:00Z", status: "SUCCESS" }],
    lineItems: { pageInfo: { hasNextPage: hasNext, endCursor }, nodes: lines },
  };
}

describe("completeLineItems", () => {
  it("follows the nested line-item connection until exhausted", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const pages = [
      { hasNextPage: true, endCursor: "c2", nodes: [line("B", 2), line("C", 3)] },
      { hasNextPage: false, endCursor: null, nodes: [line("D", 4)] },
    ];
    const shopify: ShopifyLike = {
      request: async <T,>(query: string, opts: { variables: Record<string, unknown> }) => {
        expect(query).toBe(LINE_ITEMS_QUERY);
        calls.push(opts.variables);
        const p = pages.shift()!;
        return { data: { order: { lineItems: { pageInfo: { hasNextPage: p.hasNextPage, endCursor: p.endCursor }, nodes: p.nodes } } } as unknown as T };
      },
    };
    const o = order([line("A", 1)], true, "c1");
    const requests = await completeLineItems(shopify, [o]);
    expect(requests).toBe(2);
    expect(calls.map((c) => c.cursor)).toEqual(["c1", "c2"]);
    expect(o.lineItems.nodes.map((l) => l.sku)).toEqual(["A", "B", "C", "D"]);

    const row = orderToRow(o, DEFAULT_RULES, "America/Phoenix", "2026-10-20T00:00:00Z");
    expect(row.row.units).toBe(10);
    expect(row.lines).toHaveLength(4);
    expect(row.lines.map((l) => l.line_index)).toEqual([0, 1, 2, 3]);
  });

  it("makes no request when the first page was complete", async () => {
    const shopify: ShopifyLike = {
      request: async () => {
        throw new Error("should not be called");
      },
    };
    const o = order([line("A", 1)], false, null);
    expect(await completeLineItems(shopify, [o])).toBe(0);
    expect(o.lineItems.nodes).toHaveLength(1);
  });
});
