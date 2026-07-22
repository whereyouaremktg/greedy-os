import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/db";
import {
  SEARCH_MIN_LENGTH,
  type GlobalSearchResults,
  type SearchResultItem,
} from "@/lib/search/types";

const GROUP_LIMIT = 5;

type Client = SupabaseClient<Database>;

function escapeLike(term: string): string {
  // "*" is PostgREST's wildcard alias in like/ilike and cannot be escaped —
  // strip it so a pasted "*" can't blow the query wide open.
  return term.replace(/\*/g, "").replace(/[\\%_]/g, (m) => `\\${m}`);
}

function dedupeById(items: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function searchVendors(
  supabase: Client,
  pattern: string,
): Promise<{ items: SearchResultItem[]; ids: string[] }> {
  const columns = ["name", "contact_name", "email"] as const;
  const results = await Promise.all(
    columns.map((col) =>
      supabase
        .from("vendors")
        .select("id, name, contact_name, email")
        .ilike(col, pattern)
        .limit(GROUP_LIMIT)
        .throwOnError(),
    ),
  );
  const rows = dedupeById(
    results
      .flatMap((r) => r.data ?? [])
      .map((v) => ({
        id: v.id,
        title: v.name,
        subtitle: v.contact_name ?? v.email,
        href: `/vendors?open=${v.id}`,
      })),
  ).slice(0, GROUP_LIMIT);
  return { items: rows, ids: rows.map((r) => r.id) };
}

type PoJoinRow = {
  id: string;
  po_number: string | null;
  status: string;
  vendor: { name: string } | null;
};

function poToItem(po: PoJoinRow, note?: string): SearchResultItem {
  const vendorName = po.vendor?.name ?? "Unknown vendor";
  const subtitleParts = [vendorName, po.status.replace(/_/g, " ")];
  if (note) subtitleParts.push(note);
  return {
    id: po.id,
    title: po.po_number ? `PO ${po.po_number}` : `PO — ${vendorName}`,
    subtitle: subtitleParts.join(" · "),
    href: `/purchase-orders?open=${po.id}`,
  };
}

const PO_SELECT = "id, po_number, status, vendor:vendors(name)";

async function searchPurchaseOrders(
  supabase: Client,
  pattern: string,
  vendorIds: string[],
): Promise<SearchResultItem[]> {
  const byNumber = supabase
    .from("purchase_orders")
    .select(PO_SELECT)
    .ilike("po_number", pattern)
    .limit(GROUP_LIMIT)
    .throwOnError();

  const byVendor =
    vendorIds.length > 0
      ? supabase
          .from("purchase_orders")
          .select(PO_SELECT)
          .in("vendor_id", vendorIds)
          .order("order_date", { ascending: false, nullsFirst: false })
          .limit(GROUP_LIMIT)
          .throwOnError()
      : Promise.resolve({ data: null });

  const lineColumns = ["sku", "style_number", "product_name"] as const;
  const byLine = Promise.all(
    lineColumns.map((col) =>
      supabase
        .from("po_line_items")
        .select(`sku, product_name, purchase_order:purchase_orders(${PO_SELECT})`)
        .ilike(col, pattern)
        .limit(GROUP_LIMIT)
        .throwOnError(),
    ),
  );

  const [numberRes, vendorRes, lineRes] = await Promise.all([
    byNumber,
    byVendor,
    byLine,
  ]);

  const direct = [
    ...((numberRes.data as PoJoinRow[] | null) ?? []),
    ...((vendorRes.data as PoJoinRow[] | null) ?? []),
  ].map((po) => poToItem(po));

  const viaLines = lineRes
    .flatMap((r) => r.data ?? [])
    .flatMap((line) => {
      const po = line.purchase_order as PoJoinRow | null;
      if (!po) return [];
      const label = line.sku ?? line.product_name;
      return [poToItem(po, label ? `line: ${label}` : undefined)];
    });

  return dedupeById([...direct, ...viaLines]).slice(0, GROUP_LIMIT);
}

async function searchProducts(
  supabase: Client,
  pattern: string,
): Promise<SearchResultItem[]> {
  const columns = ["sku", "name"] as const;
  const results = await Promise.all(
    columns.map((col) =>
      supabase
        .from("products")
        .select("id, sku, name, category, active")
        .ilike(col, pattern)
        .limit(GROUP_LIMIT)
        .throwOnError(),
    ),
  );
  return dedupeById(
    results
      .flatMap((r) => r.data ?? [])
      .map((p) => ({
        id: p.id,
        title: p.name,
        subtitle:
          [p.sku, p.category, p.active ? null : "inactive"]
            .filter(Boolean)
            .join(" · ") || null,
        href: `/products?open=${p.id}`,
      })),
  ).slice(0, GROUP_LIMIT);
}

async function searchRuns(
  supabase: Client,
  pattern: string,
): Promise<SearchResultItem[]> {
  const columns = ["product_name", "variant"] as const;
  const results = await Promise.all(
    columns.map((col) =>
      supabase
        .from("manufacturing_runs")
        .select("id, product_name, variant, stage, vendor:vendors(name)")
        .ilike(col, pattern)
        .limit(GROUP_LIMIT)
        .throwOnError(),
    ),
  );
  return dedupeById(
    results
      .flatMap((r) => r.data ?? [])
      .map((run) => {
        const vendor = (run.vendor as { name: string } | null)?.name;
        return {
          id: run.id,
          title: run.variant
            ? `${run.product_name} — ${run.variant}`
            : run.product_name,
          subtitle: [run.stage.replace(/_/g, " "), vendor]
            .filter(Boolean)
            .join(" · "),
          href: `/manufacturing?open=${run.id}`,
        };
      }),
  ).slice(0, GROUP_LIMIT);
}

async function searchCampaigns(
  supabase: Client,
  pattern: string,
): Promise<SearchResultItem[]> {
  const { data } = await supabase
    .from("campaigns")
    .select("id, name, type, status")
    .ilike("name", pattern)
    .limit(GROUP_LIMIT)
    .throwOnError();
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.name,
    subtitle: `${c.type.replace(/_/g, " ")} · ${c.status.replace(/_/g, " ")}`,
    href: `/campaigns?open=${c.id}`,
  }));
}

export async function searchGlobalCore(
  supabase: Client,
  rawQuery: string,
): Promise<GlobalSearchResults> {
  const query = rawQuery.trim();
  const empty: GlobalSearchResults = {
    purchaseOrders: [],
    vendors: [],
    products: [],
    runs: [],
    campaigns: [],
  };
  if (query.length < SEARCH_MIN_LENGTH) return empty;

  const pattern = `%${escapeLike(query)}%`;

  const vendorsResult = await searchVendors(supabase, pattern);
  const [purchaseOrders, products, runs, campaigns] = await Promise.all([
    searchPurchaseOrders(supabase, pattern, vendorsResult.ids),
    searchProducts(supabase, pattern),
    searchRuns(supabase, pattern),
    searchCampaigns(supabase, pattern),
  ]);

  return {
    purchaseOrders,
    vendors: vendorsResult.items,
    products,
    runs,
    campaigns,
  };
}
