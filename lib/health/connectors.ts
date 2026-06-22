import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { STALE_AFTER } from "@/lib/dashboard/staleness";
import { getCredentials } from "@/lib/connectors/credentials";

// Connector health = "is fresh data actually landing, and are the credentials
// that produce it still valid." This is the proactive watchdog: it checks the
// symptom (stale cache) AND the most common cause (missing/expiring OAuth
// tokens), so a silent pipeline death surfaces on day one.

type DB = SupabaseClient<Database>;

export type ConnectorHealthStatus = "ok" | "stale" | "never" | "disconnected";

export type ConnectorHealth = {
  connector: string;
  table: string;
  lastSyncedAt: string | null;
  ageMs: number | null;
  thresholdMs: number;
  status: ConnectorHealthStatus;
  detail: string;
  // Populated for OAuth connectors (QuickBooks) so we can flag a token that's
  // missing or about to expire before the data even goes stale.
  token?: {
    connected: boolean;
    refreshTokenExpiresAt: string | null;
    expiresInDays: number | null;
    expiringSoon: boolean;
  };
};

export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  connectors: ConnectorHealth[];
  problems: ConnectorHealth[];
};

const TOKEN_EXPIRY_WARN_DAYS = 7;
const RETROSHIP_STALE_MS = 12 * 60 * 60 * 1000; // 2× 6h cron

// Typed cache-table checks. `hubspot` is intentionally report-only (its puller
// is still a stub) — it can read "never" without raising an alert.
const TYPED_CHECKS: { connector: string; table: string; thresholdMs: number }[] =
  [
    { connector: "quickbooks", table: "qb_financials", thresholdMs: STALE_AFTER.qb },
    { connector: "shopify", table: "shopify_metrics", thresholdMs: STALE_AFTER.shopify },
    { connector: "klaviyo", table: "klaviyo_metrics", thresholdMs: STALE_AFTER.klaviyo },
    { connector: "hubspot", table: "hubspot_deals", thresholdMs: STALE_AFTER.hubspot },
  ];

function relDays(ms: number): string {
  const d = ms / 86_400_000;
  if (Math.abs(d) >= 1) return `${d.toFixed(1)}d`;
  const h = ms / 3_600_000;
  return `${h.toFixed(1)}h`;
}

async function latestSyncedAt(
  supabase: DB,
  table: string,
): Promise<string | null> {
  // Every cache table exposes synced_at. We cast the dynamic table name to a
  // single known literal purely to satisfy the typed client — only the shared
  // synced_at column is read, and the runtime value of `table` is what's
  // actually queried.
  const { data, error } = await supabase
    .from(table as "qb_financials")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.synced_at ?? null;
}

function statusFor(
  lastSyncedAt: string | null,
  thresholdMs: number,
): { status: ConnectorHealthStatus; ageMs: number | null } {
  if (!lastSyncedAt) return { status: "never", ageMs: null };
  const synced = Date.parse(lastSyncedAt);
  if (Number.isNaN(synced)) return { status: "never", ageMs: null };
  const ageMs = Date.now() - synced;
  return { status: ageMs > thresholdMs ? "stale" : "ok", ageMs };
}

async function quickbooksTokenHealth(): Promise<
  NonNullable<ConnectorHealth["token"]>
> {
  const creds = await getCredentials("quickbooks");
  const connected = Boolean(creds.refresh_token && creds.realm_id);
  const expAt = creds.refresh_token_expires_at ?? null;
  let expiresInDays: number | null = null;
  let expiringSoon = false;
  if (expAt) {
    const ms = Date.parse(expAt) - Date.now();
    if (!Number.isNaN(ms)) {
      expiresInDays = Math.floor(ms / 86_400_000);
      expiringSoon = ms < TOKEN_EXPIRY_WARN_DAYS * 86_400_000;
    }
  }
  return {
    connected,
    refreshTokenExpiresAt: expAt,
    expiresInDays,
    expiringSoon,
  };
}

export async function getConnectorHealth(supabase: DB): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();

  const typed = await Promise.all(
    TYPED_CHECKS.map(async (c): Promise<ConnectorHealth> => {
      const lastSyncedAt = await latestSyncedAt(supabase, c.table);
      const { status, ageMs } = statusFor(lastSyncedAt, c.thresholdMs);
      const base: ConnectorHealth = {
        connector: c.connector,
        table: c.table,
        lastSyncedAt,
        ageMs,
        thresholdMs: c.thresholdMs,
        status,
        detail:
          status === "never"
            ? "no rows yet"
            : status === "stale"
              ? `last sync ${relDays(ageMs ?? 0)} ago (threshold ${relDays(c.thresholdMs)})`
              : `fresh — ${relDays(ageMs ?? 0)} ago`,
      };

      if (c.connector === "quickbooks") {
        const token = await quickbooksTokenHealth();
        base.token = token;
        if (!token.connected) {
          base.status = "disconnected";
          base.detail =
            "no refresh_token — OAuth disconnected. Reconnect at /settings.";
        } else if (token.expiringSoon) {
          base.detail =
            token.expiresInDays != null && token.expiresInDays < 0
              ? `refresh token expired ${Math.abs(token.expiresInDays)}d ago — reconnect at /settings`
              : `refresh token expires in ${token.expiresInDays}d — reconnect at /settings`;
        }
      }

      return base;
    }),
  );

  // Retroship (ShipHero 3PL) isn't in the generated types yet; query its
  // freshness via a localized untyped cast so it's still covered.
  let retroship: ConnectorHealth;
  try {
    const untyped = supabase as unknown as SupabaseClient;
    const { data } = await untyped
      .from("retroship_inventory")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSyncedAt = (data as { synced_at?: string } | null)?.synced_at ?? null;
    const { status, ageMs } = statusFor(lastSyncedAt, RETROSHIP_STALE_MS);
    retroship = {
      connector: "shiphero",
      table: "retroship_inventory",
      lastSyncedAt,
      ageMs,
      thresholdMs: RETROSHIP_STALE_MS,
      status,
      detail:
        status === "never"
          ? "no rows yet"
          : status === "stale"
            ? `last sync ${relDays(ageMs ?? 0)} ago (threshold ${relDays(RETROSHIP_STALE_MS)})`
            : `fresh — ${relDays(ageMs ?? 0)} ago`,
    };
  } catch (err) {
    retroship = {
      connector: "shiphero",
      table: "retroship_inventory",
      lastSyncedAt: null,
      ageMs: null,
      thresholdMs: RETROSHIP_STALE_MS,
      status: "never",
      detail: `check failed: ${(err as Error).message}`,
    };
  }

  const connectors = [...typed, retroship];

  // "Problem" = something an operator should act on. A never-synced stub
  // (hubspot) is reported but not treated as a problem so it doesn't nag.
  const problems = connectors.filter(
    (c) => c.status === "stale" || c.status === "disconnected" || c.token?.expiringSoon,
  );

  return { ok: problems.length === 0, checkedAt, connectors, problems };
}
