import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Connector credentials store.
//
// Each connector has a fixed set of user-entered keys defined in CONNECTORS
// below. Pullers and OAuth routes read them by name via getCredential() /
// requireCredentials() / getCredentials(). Writes happen via setCredentials()
// (token refresh, OAuth callback, settings form).
//
// SECURITY: values are stored plaintext. RLS has no authenticated policy, so
// only the service-role client (cron pullers + server actions) can read.
// v1 trust model is two-user, single-tenant; future hardening = pgcrypto or
// Supabase Vault.
//
// Some connectors (hubspot, shopify, klaviyo) keep an env-var fallback so
// legacy Vercel env vars keep working — the read functions check the DB,
// then fall back to process.env[key]. QuickBooks does NOT use env fallback:
// its keys are lowercase (`client_id`, etc.) which never collide with env
// names, and the OAuth flow requires DB-backed tokens regardless.

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
    id: "shiphero",
    label: "ShipHero (Retroship 3PL)",
    description: "True on-hand, inbound POs, and actual wholesale orders.",
    fields: [
      {
        key: "SHIPHERO_REFRESH_TOKEN",
        label: "Refresh Token",
        type: "secret" as const,
        required: true,
        hint: "From ShipHero → Account → API. Long-lived; the puller exchanges it for a 28-day access token each run.",
      },
    ],
  },
  {
    id: "quickbooks",
    label: "QuickBooks",
    description: "Cash, AR/AP, P&L. OAuth via Intuit.",
    fields: [
      {
        key: "client_id",
        label: "Client ID",
        type: "text" as const,
        required: true,
        hint: "From the Intuit developer portal (app keys).",
      },
      {
        key: "client_secret",
        label: "Client Secret",
        type: "secret" as const,
        required: true,
      },
      {
        key: "env",
        label: "Environment",
        type: "text" as const,
        required: false,
        hint: '"sandbox" or "production" (default: production).',
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

// Connectors that fall back to process.env[key] when the DB row is absent.
// QuickBooks is excluded — its keys are lowercase and OAuth tokens live in
// the DB only.
const ENV_FALLBACK_CONNECTORS = new Set<string>(["hubspot", "shopify", "klaviyo"]);

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

// Thrown by requireCredentials() when one or more required keys are absent.
export class MissingCredentialsError extends Error {
  readonly connector: string;
  readonly missingKeys: string[];

  constructor(connector: string, missingKeys: string[]) {
    super(
      `Missing ${connector} credentials: ${missingKeys
        .map((k) => `(${connector}, ${k})`)
        .join(", ")}. ` +
        `Open /settings → ${connector} and fill in the missing rows.`,
    );
    this.name = "MissingCredentialsError";
    this.connector = connector;
    this.missingKeys = missingKeys;
  }
}

// Read a single credential value. Checks the DB first, then env var (only for
// connectors registered in ENV_FALLBACK_CONNECTORS). Returns null when neither
// source has a value.
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
  if (ENV_FALLBACK_CONNECTORS.has(connector)) {
    const fromEnv = process.env[key]?.trim();
    if (fromEnv && fromEnv.length > 0) return fromEnv;
  }
  return null;
}

// Required single-key version — throws a clear, user-actionable error when
// missing. Kept for backward compat with the hubspot puller; new code should
// prefer requireCredentials(connector, [...]) which throws a typed error.
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

// Read every row for a connector as a flat map. Does NOT consult env vars —
// this is the canonical "what's in the DB right now" view used by puller
// helpers that need to inspect optional/runtime keys (access_token, expires
// timestamps, etc.).
export async function getCredentials(
  connector: ConnectorId,
): Promise<Record<string, string>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("connector_credentials")
    .select("key, value")
    .eq("connector", connector);
  if (error) {
    throw new Error(`connector_credentials list (${connector}): ${error.message}`);
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.value) map[row.key] = row.value;
  }
  return map;
}

// Require multiple credentials at once. Throws MissingCredentialsError naming
// every absent key. Reads via getCredential so env-var fallback still applies
// for connectors that opt in.
export async function requireCredentials(
  connector: ConnectorId,
  keys: string[],
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await getCredential(connector, key)] as const),
  );
  const missing = entries.filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new MissingCredentialsError(connector, missing);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of entries) out[k] = v as string;
  return out;
}

// Atomic upsert of a connector's keys. Empty / whitespace-only values are
// skipped (call deleteCredentials() if you want to clear a row). updatedBy is
// the auth user id when known (server action) — null/undefined when called
// from background routes (cron, OAuth token rotation).
export async function setCredentials(
  connector: ConnectorId,
  entries: Record<string, string>,
  updatedBy?: string | null,
): Promise<void> {
  const rows = Object.entries(entries)
    .map(([key, raw]) => {
      const value = typeof raw === "string" ? raw.trim() : "";
      return value.length > 0
        ? {
            connector,
            key,
            value,
            updated_at: new Date().toISOString(),
            updated_by: updatedBy ?? null,
          }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("connector_credentials")
    .upsert(rows, { onConflict: "connector,key" });
  if (error) {
    throw new Error(`connector_credentials upsert (${connector}): ${error.message}`);
  }
}

// Delete specific keys (or every row for a connector when keys is omitted).
// Used by the Settings UI: "Disconnect" wipes a whole connector; the QB
// "Disconnect" button passes just the OAuth-runtime keys so the user's
// client_id / client_secret survive a re-connect.
export async function deleteCredentials(
  connector: ConnectorId,
  keys?: string[],
): Promise<void> {
  const supabase = createServiceClient();
  let query = supabase.from("connector_credentials").delete().eq("connector", connector);
  if (keys && keys.length > 0) {
    query = query.in("key", keys);
  }
  const { error } = await query;
  if (error) {
    throw new Error(`connector_credentials delete (${connector}): ${error.message}`);
  }
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
  const envFallback = ENV_FALLBACK_CONNECTORS.has(connector);
  return fields.map((f) => {
    const updatedAt = dbByKey.get(f.key);
    if (updatedAt) return { key: f.key, source: "settings", updatedAt };
    if (envFallback) {
      const envVal = process.env[f.key]?.trim();
      if (envVal) return { key: f.key, source: "env", updatedAt: null };
    }
    return { key: f.key, source: null, updatedAt: null };
  });
}

// QuickBooks-specific connection state for the Settings card. Derives the
// connection lifecycle (Not connected → Ready to connect → Connected →
// Expiring) without exposing token values to the caller.
export type QuickbooksConnectionState =
  | { kind: "needs_app_credentials" }
  | { kind: "ready_to_connect" }
  | {
      kind: "connected";
      realmId: string;
      env: "sandbox" | "production";
      accessTokenExpiresAt: string | null;
      refreshTokenExpiresAt: string | null;
      refreshExpiresInDays: number | null;
      reconnectRecommended: boolean;
    };

export async function getQuickbooksConnectionState(): Promise<QuickbooksConnectionState> {
  const all = await getCredentials("quickbooks");
  const hasClient = Boolean(all.client_id && all.client_secret);
  if (!hasClient) return { kind: "needs_app_credentials" };

  const refresh = all.refresh_token;
  const realm = all.realm_id;
  if (!refresh || !realm) return { kind: "ready_to_connect" };

  const refreshExpAt = all.refresh_token_expires_at ?? null;
  let refreshExpiresInDays: number | null = null;
  let reconnectRecommended = false;
  if (refreshExpAt) {
    const ms = new Date(refreshExpAt).getTime() - Date.now();
    if (!Number.isNaN(ms)) {
      refreshExpiresInDays = Math.floor(ms / 86_400_000);
      reconnectRecommended = ms < 0 || ms < 7 * 86_400_000;
    }
  }

  const env: "sandbox" | "production" =
    all.env?.toLowerCase() === "sandbox" ? "sandbox" : "production";

  return {
    kind: "connected",
    realmId: realm,
    env,
    accessTokenExpiresAt: all.access_token_expires_at ?? null,
    refreshTokenExpiresAt: refreshExpAt,
    refreshExpiresInDays,
    reconnectRecommended,
  };
}

// Runtime OAuth keys written by the callback / refresh flow. Exported so the
// Disconnect server action can clear exactly these (preserving client_id /
// client_secret / env).
export const QUICKBOOKS_OAUTH_RUNTIME_KEYS = [
  "realm_id",
  "access_token",
  "access_token_expires_at",
  "refresh_token",
  "refresh_token_expires_at",
] as const;
