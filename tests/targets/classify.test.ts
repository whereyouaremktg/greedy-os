import { describe, expect, it } from "vitest";
import {
  classifyOrder,
  DEFAULT_RULES,
  isProductSku,
  type OrderFacts,
} from "@/lib/targets/classify";

function order(overrides: Partial<OrderFacts> = {}): OrderFacts {
  return {
    test: false,
    cancelledAt: null,
    financialStatus: "PAID",
    tags: [],
    appName: "Online Store",
    channelName: "Online Store",
    sourceName: "web",
    grossSales: 37,
    discounts: 0,
    ...overrides,
  };
}

describe("classifyOrder", () => {
  it("counts a paid Online Store order as DTC", () => {
    expect(classifyOrder(order()).bucket).toBe("dtc");
  });

  it("excludes test, cancelled and unpaid orders, in that order", () => {
    expect(classifyOrder(order({ test: true })).bucket).toBe("excluded_test");
    expect(
      classifyOrder(order({ cancelledAt: "2026-10-05T00:00:00Z" })).bucket,
    ).toBe("excluded_cancelled");
    expect(classifyOrder(order({ financialStatus: "PENDING" })).bucket).toBe(
      "excluded_unpaid",
    );
    expect(classifyOrder(order({ financialStatus: "VOIDED" })).bucket).toBe(
      "excluded_unpaid",
    );
  });

  it("keeps refunded and partially refunded orders as paid (returns net them out)", () => {
    expect(classifyOrder(order({ financialStatus: "REFUNDED" })).bucket).toBe("dtc");
    expect(
      classifyOrder(order({ financialStatus: "PARTIALLY_REFUNDED" })).bucket,
    ).toBe("dtc");
  });

  it("treats seeding tags as excluded seeding regardless of channel", () => {
    expect(classifyOrder(order({ tags: ["Gifting", "PR"] })).bucket).toBe(
      "excluded_seeding",
    );
    expect(classifyOrder(order({ tags: ["SEEDING"] })).bucket).toBe(
      "excluded_seeding",
    );
    const r = classifyOrder(
      order({
        tags: ["Gifting"],
        appName: "Shopify Claude Connector App",
        sourceName: "341262598145",
      }),
    );
    expect(r.bucket).toBe("excluded_seeding");
    expect(r.reason).toMatch(/Gifting/);
  });

  it("treats a 100% discounted order as seeding even without a tag", () => {
    const r = classifyOrder(
      order({
        appName: "Draft Orders",
        sourceName: "shopify_draft_order",
        grossSales: 354,
        discounts: 354,
      }),
    );
    expect(r.bucket).toBe("excluded_seeding");
    expect(r.reason).toBe("100% discount");
  });

  it("gives B2B-tagged orders their own bucket, even from Draft Orders", () => {
    expect(
      classifyOrder(
        order({
          tags: ["B2B"],
          appName: "Draft Orders",
          sourceName: "shopify_draft_order",
          grossSales: 320,
        }),
      ).bucket,
    ).toBe("b2b");
    expect(classifyOrder(order({ tags: ["b2b"] })).bucket).toBe("b2b");
  });

  it("excludes the listed channels but keeps ShopMy-tagged Online Store sales", () => {
    expect(
      classifyOrder(
        order({ appName: "Draft Orders", sourceName: "shopify_draft_order", discounts: 10 }),
      ).bucket,
    ).toBe("excluded_channel");
    expect(classifyOrder(order({ appName: "ShopMy", sourceName: "123" })).bucket).toBe(
      "excluded_channel",
    );
    expect(classifyOrder(order({ appName: "LTK", sourceName: "456" })).bucket).toBe(
      "excluded_channel",
    );
    expect(
      classifyOrder(
        order({ appName: "Shopify Mobile for iPhone", sourceName: "iphone" }),
      ).bucket,
    ).toBe("excluded_channel");
    // Affiliate-attributed, paid, via the Online Store: real DTC revenue.
    expect(classifyOrder(order({ tags: ["ShopMy"], discounts: 3.84 })).bucket).toBe(
      "dtc",
    );
  });

  it("maps marketplaces by app name", () => {
    expect(
      classifyOrder(
        order({
          appName: "Greedy Marketplace Sync",
          channelName: null,
          sourceName: "434732466177",
          tags: ["marketplace", "ulta"],
        }),
      ).bucket,
    ).toBe("mp_ulta");
    expect(
      classifyOrder(order({ appName: "TikTok", channelName: "TikTok", sourceName: "tiktok" })).bucket,
    ).toBe("mp_tiktok");
    expect(
      classifyOrder(order({ appName: "Shop", channelName: "Shop", sourceName: "3890849" })).bucket,
    ).toBe("mp_shop");
    expect(
      classifyOrder(order({ appName: "Facebook & Instagram", sourceName: "2329312" })).bucket,
    ).toBe("mp_meta");
    expect(
      classifyOrder(order({ appName: "Meta AI and Muse", sourceName: "999" })).bucket,
    ).toBe("mp_meta");
  });

  it("sends unknown channels to dtc_other with the channel in the reason", () => {
    const r = classifyOrder(
      order({ appName: "Awardco | Glow Beauty", channelName: null, sourceName: "777" }),
    );
    expect(r.bucket).toBe("dtc_other");
    expect(r.reason).toContain("Awardco");
  });

  it("counts the headless storefront as DTC", () => {
    expect(
      classifyOrder(
        order({ appName: "Glow Beauty Hair Headless", channelName: null, sourceName: "888" }),
      ).bucket,
    ).toBe("dtc");
  });
});

describe("isProductSku", () => {
  it("excludes shipping protection from units", () => {
    expect(isProductSku("CORSOSP", DEFAULT_RULES)).toBe(false);
    expect(isProductSku("GD-F-BRN", DEFAULT_RULES)).toBe(true);
    expect(isProductSku(null, DEFAULT_RULES)).toBe(true);
  });
});
