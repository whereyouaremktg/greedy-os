import "server-only";
import { runShopifyOrdersSync } from "@/lib/pullers/shopify-orders";
import { runShipHeroShipmentsSync } from "@/lib/pullers/shiphero-shipments";

// The Q4 Targets refresh = Shopify orders (revenue) then ShipHero shipments
// (fulfillment cost), sharing one time budget. The two sources are
// independent: a Shopify credential problem must not hide fulfillment data
// and vice versa, so each half reports its own result and the job only
// throws when both failed.
export type TargetsSyncResult = {
  ok: boolean;
  shopify: { ok: boolean; ordersUpserted: number; complete: boolean; message: string };
  shiphero: { ok: boolean; shipmentsUpserted: number; complete: boolean; message: string };
  message: string;
};

const SHIPHERO_SHARE = 0.4;
const MIN_SHIPHERO_MS = 8_000;

export async function runTargetsSync(opts: {
  budgetMs: number;
  trigger: "cron" | "manual" | "backfill";
}): Promise<TargetsSyncResult> {
  const started = Date.now();
  const shopifyBudget = Math.max(5_000, Math.round(opts.budgetMs * (1 - SHIPHERO_SHARE)));

  const shopify = await runShopifyOrdersSync({ budgetMs: shopifyBudget, trigger: opts.trigger })
    .then((s) => ({ ok: true, ordersUpserted: s.ordersUpserted, complete: s.complete, message: s.message }))
    .catch((err: unknown) => ({
      ok: false,
      ordersUpserted: 0,
      complete: false,
      message: err instanceof Error ? err.message : String(err),
    }));

  const remaining = opts.budgetMs - (Date.now() - started);
  const shiphero = await runShipHeroShipmentsSync({ budgetMs: Math.max(MIN_SHIPHERO_MS, remaining), trigger: opts.trigger })
    .then((s) => ({ ok: true, shipmentsUpserted: s.shipmentsUpserted, complete: s.complete, message: s.message }))
    .catch((err: unknown) => ({
      ok: false,
      shipmentsUpserted: 0,
      complete: false,
      message: err instanceof Error ? err.message : String(err),
    }));

  const message = [
    `Shopify: ${shopify.ok ? shopify.message || "ok" : `failed — ${shopify.message}`}`,
    `ShipHero: ${shiphero.ok ? shiphero.message || "ok" : `failed — ${shiphero.message}`}`,
  ].join(" · ");

  if (!shopify.ok && !shiphero.ok) {
    throw new Error(message);
  }
  return { ok: shopify.ok && shiphero.ok, shopify, shiphero, message };
}
