import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateRunInput } from "@/lib/manufacturing/core";
import type {
  ParsedManufacturingOrder,
  ParsedMoLineItem,
} from "@/lib/manufacturing/parse-schema";
import { findOrCreateVendorByName } from "@/lib/vendors/lookup";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

const ANCILLARY_PATTERN =
  /\b(carton|packaging fee|packing fee|packaging|shipping|freight|service fee|label)\b/i;

export function isAncillaryLine(item: ParsedMoLineItem): boolean {
  if (!item.is_finished_good) return true;
  return ANCILLARY_PATTERN.test(item.description);
}

function lineValueUsd(item: ParsedMoLineItem): number {
  if (item.line_total_usd != null && item.line_total_usd > 0) {
    return item.line_total_usd;
  }
  return (item.unit_price_usd ?? 0) * item.quantity;
}

/** Main finished-good line — highest dollar value, not highest qty (cartons skew qty). */
export function pickPrimaryLineItem(
  parsed: ParsedManufacturingOrder,
): ParsedMoLineItem {
  const finished = parsed.line_items.filter((item) => !isAncillaryLine(item));
  const pool = finished.length > 0 ? finished : parsed.line_items;
  return pool.reduce((best, item) =>
    lineValueUsd(item) > lineValueUsd(best) ? item : best,
  );
}

function scoreName(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((t) => n.includes(t)).length;
  return hits > 0 ? 40 + hits * 10 : 0;
}

export async function matchProductId(
  supabase: Client,
  productName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name")
    .eq("active", true)
    .limit(200);

  if (error || !data?.length) return null;

  const ranked = data
    .map((p) => ({ id: p.id, score: scoreName(p.name, productName) }))
    .filter((r) => r.score >= 60)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.id ?? null;
}

export function buildManufacturingOrderNotes(
  parsed: ParsedManufacturingOrder,
  primary: ParsedMoLineItem,
): string {
  const parts = [
    parsed.pi_number ? `PI: ${parsed.pi_number}` : null,
    parsed.payment_terms ? `Payment: ${parsed.payment_terms}` : null,
    parsed.deposit_amount_usd != null
      ? `Deposit: $${parsed.deposit_amount_usd.toLocaleString()}`
      : null,
    parsed.total_amount_usd != null
      ? `Total: $${parsed.total_amount_usd.toLocaleString()} ${parsed.currency}`
      : null,
    parsed.production_remarks ? parsed.production_remarks : null,
  ].filter(Boolean);

  const ancillary = parsed.line_items.filter(
    (item) => item !== primary && isAncillaryLine(item),
  );
  if (ancillary.length > 0) {
    parts.push(
      "Other lines:",
      ...ancillary.map(
        (item) =>
          `- ${item.description}: ${item.quantity.toLocaleString()} pcs` +
          (item.line_total_usd != null
            ? ` ($${item.line_total_usd.toLocaleString()})`
            : ""),
      ),
    );
  }

  return parts.join("\n").trim();
}

export function productNameFromLine(item: ParsedMoLineItem): string {
  let desc = item.description.trim();
  desc = desc.replace(/^item:\s*/i, "").trim();
  const sizeIdx = desc.search(/\bsize:\s*/i);
  if (sizeIdx > 0) desc = desc.slice(0, sizeIdx).trim();
  const withoutPrefix = desc.replace(/^glossy\s+/i, "").trim();
  return withoutPrefix.length > 0 ? withoutPrefix : item.description.trim();
}

export type ParsedToRunResult =
  | {
      ok: true;
      input: CreateRunInput;
      vendorName: string;
      vendorCreated: boolean;
      productId: string | null;
      primaryLine: ParsedMoLineItem;
    }
  | { ok: false; error: string };

export async function parsedToCreateRunInput(
  supabase: Client,
  actorUserId: string | null,
  parsed: ParsedManufacturingOrder,
  vendorId?: string,
): Promise<ParsedToRunResult> {
  const primary = pickPrimaryLineItem(parsed);
  const productName = productNameFromLine(primary);

  let resolvedVendorId = vendorId ?? null;
  let vendorName = parsed.vendor_name.trim();
  let vendorCreated = false;

  if (!resolvedVendorId) {
    const vendor = await findOrCreateVendorByName(
      supabase,
      actorUserId,
      parsed.vendor_name,
    );
    if (!vendor.ok) {
      return { ok: false, error: vendor.error.message };
    }
    resolvedVendorId = vendor.data.id;
    vendorName = vendor.data.name;
    vendorCreated = vendor.data.created;
  }

  const productId = await matchProductId(supabase, productName);

  const input: CreateRunInput = {
    vendor_id: resolvedVendorId,
    product_id: productId,
    product_name: productName,
    variant: primary.variant?.trim() || null,
    quantity: primary.quantity,
    stage: "ordered",
    expected_completion_date: parsed.expected_completion_date ?? null,
    expected_arrival_date: parsed.expected_arrival_date ?? null,
    notes: buildManufacturingOrderNotes(parsed, primary) || null,
  };

  return {
    ok: true,
    input,
    vendorName,
    vendorCreated,
    productId,
    primaryLine: primary,
  };
}
