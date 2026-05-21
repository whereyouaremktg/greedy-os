import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Connector key schema. Each connector has a fixed set of keys. The Settings
// UI renders one field per (connector, key); the pullers ask for keys by name
// via getCredential() — which checks the DB first, then falls back to the
// process env. This keeps existing Vercel env vars working while letting the
// user manage credentials from inside the app.

export const CONNECTORS = [
  {
    id: "hubspot",
    label: "HubSpot",
    description: "Wholesale pipeline (deals, owners, companies).",
    fields: [
      {
        key: "HUBSPOT_PRIVATE_APP_TOKEN",
        label: "Private App Token",
        type: "secret" as const,
        required: true,
        hint: "Settings → Integrations → Private Apps → Show token.",
      },
      {
        key: "HUBSPOT_DEAL_GEO_PROPERTY",
        label: "Deal geo property (optional)",
        type: "text" as const,
        required: false,
        hint: "Overrides auto-discovery. E.g. `state`, `state_region`.",
      },
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    description: "DTC revenue, orders, top products.",
    fields: [
      {
        key: "SHOPIFY_STORE_DOMAIN",
        label: "Store domain",
        type: "text" as const,
        required: true,
        hint: "e.g. glow.myshopify.com",
      },
      {
        key: "SHOPIFY_CLIENT_ID",
        label: "Dev Dashboard Client ID",
        type: "text" as const,
        required: false,
        hint: "Preferred. Puller exchanges for a 24h token each run.",
      },
      {
        key: "SHOPIFY_CLIENT_SECRET",
        label: "Dev Dashboard Client Secret",
        type: "secret" as const,
        required: false,
      },
      {
        key: "SHOPIFY_ADMIN_ACCESS_TOKEN",
        label: "Legacy admin access token",
        type: "secret" as const,
        required: false,
        hint: "Only needed if not using a Dev Dashboard app.",
      },
    ],
  },
  {
    id: "klaviyo",
    label: "Klaviyo",
    description: "Email + affiliate revenue, campaigns, flows.",
    fields: [
      {
        key: "KLAVIYO_PRIVATE_API_KEY",
        label: "Private API Key",
        type: "secret" as const,
        required: true,
      },
    ],
  },
  {
    id: "quickbooks",
    label: "QuickBooks",
    description: "Cash, AR/AP, P&L.",
    fields: [
      {
        key: "QUICKBOOKS_CLIENT_ID",
        label: "Client ID",
        type: "text" as const,
        required: true,
      },
      {
        key: "QUICKBOOKS_CLIENT_SECRET",
        label: "Client Secret",
        type: "secret" as const,
        required: true,
      },
      {
        key: "QUICKBOOKS_REFRESH_TOKEN",
        label: "Refresh Token",
        type: "secret" as const,
        required: true,
      },
      {
        key: "QUICKBOOKS_REALM_ID",
        label: "Realm ID",
        type: "text" as const,
        required: true,
      },
    ],
  },
] as const;

export type ConnectorId = (typeof CONNECTORS)[number]["id"];

const CONNECTOR_IDS = new Set<string>(CONNECTORS.map((c) => c.id));
const KEYS_BY_CONNECTOR = new Map<string, ReadonlySet<string>>(
  CONNECTORS.map((c) => [
    c.id,
    new Set(c.fields.map((f) => f.key as string)),
  ]),
);

export function isKnownConnectorKey(connector: string, key: string): boolean {
  return KEYS_BY_CONNECTOR.get(connector)?.has(key) ?? false;
}

export function isConnectorId(value: string): value is ConnectorId {
  return CONNECTOR_IDS.has(value);
}

// Where a credential value came from. Used by the Settings UI to render the
// "Saved", "Env", or "Not configured" badges.
export type CredentialSource = "settings" | "env" | null;

export type CredentialStatus = {
  key: string;
  source: CredentialSource;
  updatedAt: string | null;
};

// Read a single credential value. Checks the DB first, then env var.
// Returns null when neither source has a value.
export async function getCredential(
  connector: ConnectorId,
  key: string,
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("connector_credentials")
    .select("value")
    .eq("connector", connector)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    throw new Error(`connector_credentials read (${connector}/${key}): ${error.message}`);
  }
  const fromDb = data?.value?.trim();
  if (fromDb) return fromDb;
  const fromEnv = process.env[key]?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

// Required version — throws a clear, user-actionable error if missing.
export async function requireCredential(
  connector: ConnectorId,
  key: string,
  hint?: string,
): Promise<string> {
  const value = await getCredential(connector, key);
  if (!value) {
    const tail = hint ? ` ${hint}` : "";
    throw new Error(
      `Missing ${connector} credential: ${key} is not configured. ` +
        `Set it in Settings → ${connector} or as a Vercel env var.${tail}`,
    );
  }
  return value;
}

// Per-connector status used by the Settings page (no values returned).
export async function getConnectorStatus(
  connector: ConnectorId,
): Promise<CredentialStatus[]> {
  const fields = CONNECTORS.find((c) => c.id === connector)?.fields ?? [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("connector_credentials")
    .select("key, updated_at")
    .eq("connector", connector);
  if (error) {
    throw new Error(`connector_credentials list (${connector}): ${error.message}`);
  }
  const dbByKey = new Map(data?.map((r) => [r.key, r.updated_at]) ?? []);
  return fields.map((f) => {
    const updatedAt = dbByKey.get(f.key);
    if (updatedAt) return { key: f.key, source: "settings", updatedAt };
    const envVal = process.env[f.key]?.trim();
    if (envVal) return { key: f.key, source: "env", updatedAt: null };
    return { key: f.key, source: null, updatedAt: null };
  });
}
