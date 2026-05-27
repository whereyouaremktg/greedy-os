import "server-only";
import { Client } from "@hubspot/api-client";
import type { SimplePublicObjectWithAssociations as DealWithAssociations } from "@hubspot/api-client/lib/codegen/crm/deals";
import { createServiceClient } from "@/lib/supabase/service";
import { getCredential, requireCredential } from "@/lib/connectors/credentials";

// HubSpot deal properties we always want, in addition to the discovered geo property.
const DEAL_PROPERTIES = [
  "dealname",
  "amount",
  "dealstage",
  "closedate",
  "hubspot_owner_id",
  "hs_object_id",
];

// Preferred exact-name candidates for the deal-level geo (state) property.
// Order matters: first match wins.
const GEO_EXACT_CANDIDATES = [
  "state",
  "state_region",
  "region",
  "territory",
  "deal_state",
  "shipping_state",
  "billing_state",
];

// Keywords used for the fuzzy fallback when no exact-name candidate exists.
const GEO_FUZZY_KEYWORDS = ["state", "region", "territory"];

async function discoverGeoProperty(client: Client): Promise<string> {
  const override = (await getCredential("hubspot", "HUBSPOT_DEAL_GEO_PROPERTY"))?.trim();
  if (override) return override;

  const result = await client.crm.properties.coreApi.getAll("deals", false);
  const names = result.results
    .filter((p) => !p.archived)
    .map((p) => ({ name: p.name, label: p.label ?? "" }));

  // 1. Exact match in priority order.
  for (const candidate of GEO_EXACT_CANDIDATES) {
    if (names.some((p) => p.name === candidate)) return candidate;
  }

  // 2. Fuzzy match on name or label — only if it's unambiguous (single hit).
  const fuzzy = names.filter((p) =>
    GEO_FUZZY_KEYWORDS.some(
      (kw) =>
        p.name.toLowerCase().includes(kw) ||
        p.label.toLowerCase().includes(kw),
    ),
  );
  if (fuzzy.length === 1) return fuzzy[0].name;

  const candidates = fuzzy.map((p) => `${p.name} ("${p.label}")`).join(", ");
  throw new Error(
    `No deal-level geo property found on HubSpot deals. ` +
      (fuzzy.length > 1
        ? `Multiple ambiguous candidates: ${candidates}. `
        : `No candidate matched names ${JSON.stringify(GEO_EXACT_CANDIDATES)} or keywords ${JSON.stringify(GEO_FUZZY_KEYWORDS)}. `) +
      `Add a "state" property to deals in HubSpot or set HUBSPOT_DEAL_GEO_PROPERTY env var.`,
  );
}

async function loadOwners(client: Client): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  let after: string | undefined;
  do {
    const page = await client.crm.owners.ownersApi.getPage(
      undefined,
      after,
      100,
      false,
    );
    for (const owner of page.results) {
      const fullName = [owner.firstName, owner.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      owners.set(owner.id, fullName || owner.email || owner.id);
    }
    after = page.paging?.next?.after;
  } while (after);
  return owners;
}

async function loadCompanyNames(
  client: Client,
  companyIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    const result = await client.crm.companies.batchApi.read({
      properties: ["name"],
      propertiesWithHistory: [],
      inputs: chunk.map((id) => ({ id })),
    });
    for (const c of result.results) {
      const n = c.properties.name?.trim();
      if (n) names.set(c.id, n);
    }
  }
  return names;
}

function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseCloseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // HubSpot returns date-typed properties as ISO timestamps; slice to YYYY-MM-DD.
  return raw.slice(0, 10);
}

function firstAssociatedCompanyId(
  deal: DealWithAssociations,
): string | undefined {
  return deal.associations?.companies?.results?.[0]?.id;
}

async function isHubspotDealsSyncEnabled(): Promise<boolean> {
  if (process.env.HUBSPOT_SYNC_DEALS === "false") return false;
  const stored = (await getCredential("hubspot", "HUBSPOT_SYNC_DEALS"))?.trim();
  return stored !== "false";
}

export async function runHubspotPull() {
  const supabase = createServiceClient();

  if (!(await isHubspotDealsSyncEnabled())) {
    const { error } = await supabase.from("hubspot_deals").delete().neq("id", "");
    if (error) throw new Error(`hubspot_deals clear: ${error.message}`);
    return { ok: true, rows: 0, deals_sync: "disabled" as const };
  }

  const token = await requireCredential(
    "hubspot",
    "HUBSPOT_PRIVATE_APP_TOKEN",
    "Create a HubSpot Private App with scopes crm.objects.deals.read, " +
      "crm.objects.companies.read, crm.objects.owners.read, crm.schemas.deals.read.",
  );

  const client = new Client({ accessToken: token });
  const now = new Date().toISOString();

  const geoProperty = await discoverGeoProperty(client);
  const owners = await loadOwners(client);

  const requestedProperties = Array.from(
    new Set([...DEAL_PROPERTIES, geoProperty]),
  );

  // Paginate every (non-archived) deal, asking for associated companies so we
  // can resolve a single company name per deal.
  const deals: DealWithAssociations[] = await client.crm.deals.getAll(
    100,
    undefined,
    requestedProperties,
    undefined,
    ["companies"],
    false,
  );

  const companyIds = Array.from(
    new Set(
      deals
        .map(firstAssociatedCompanyId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const companyNames = await loadCompanyNames(client, companyIds);

  const rows = deals.map((deal) => {
    const props = deal.properties;
    const ownerId = props.hubspot_owner_id ?? "";
    const companyId = firstAssociatedCompanyId(deal);
    return {
      id: deal.id,
      deal_name: props.dealname?.trim() || "(untitled)",
      company: companyId ? (companyNames.get(companyId) ?? null) : null,
      stage: props.dealstage ?? "",
      amount: parseAmount(props.amount),
      state: props[geoProperty]?.trim() || null,
      owner: ownerId ? (owners.get(ownerId) ?? null) : null,
      close_date: parseCloseDate(props.closedate),
      synced_at: now,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from("hubspot_deals")
      .upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`hubspot_deals upsert: ${error.message}`);
  }

  // Stale-row delete: anything in the cache that wasn't in this pull is gone
  // from HubSpot (closed/archived/deleted) and shouldn't keep showing up in
  // dashboard tiles.
  const currentIds = new Set(rows.map((r) => r.id));
  const { data: existing, error: selErr } = await supabase
    .from("hubspot_deals")
    .select("id");
  if (selErr) throw new Error(`hubspot_deals select: ${selErr.message}`);
  const staleIds = (existing ?? [])
    .map((r) => r.id)
    .filter((id) => !currentIds.has(id));
  if (staleIds.length > 0) {
    const { error: delErr } = await supabase
      .from("hubspot_deals")
      .delete()
      .in("id", staleIds);
    if (delErr)
      throw new Error(`hubspot_deals delete stale: ${delErr.message}`);
  }

  return { ok: true, rows: rows.length, geo_property: geoProperty };
}
