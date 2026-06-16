import "server-only";
import {
  getCredentials,
  requireCredentials,
  setCredentials,
} from "@/lib/connectors/credentials";

// ShipHero auth. The user supplies a long-lived REFRESH token (Account → API);
// the public API itself wants a 28-day JWT ACCESS token in the Authorization
// header. We mint access tokens from the refresh token and cache the result in
// connector_credentials so a burst of cron pulls shares one token.
//
// Runtime keys written here (lowercase, not user-entered):
//   access_token             — the current JWT
//   access_token_expires_at  — ISO timestamp; we refresh ~1 day early

const REFRESH_URL = "https://public-api.shiphero.com/auth/refresh";

// Refresh this many ms BEFORE the real expiry so an in-flight pull never trips
// over a token that dies mid-run.
const EXPIRY_SKEW_MS = 24 * 60 * 60 * 1000; // 1 day

type RefreshResponse = {
  access_token: string;
  expires_in: number; // seconds
  token_type?: string;
};

async function mintAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  const res = await fetch(REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ShipHero token refresh failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as RefreshResponse;
  if (!json.access_token) {
    throw new Error("ShipHero token refresh returned no access_token");
  }
  const expiresAt = new Date(
    Date.now() + (json.expires_in ?? 0) * 1000,
  ).toISOString();
  return { accessToken: json.access_token, expiresAt };
}

function isStillFresh(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return false;
  return ms - Date.now() > EXPIRY_SKEW_MS;
}

// Returns a usable access token, refreshing (and persisting) when the cached
// one is absent or within the skew window of expiry.
export async function getShipHeroAccessToken(): Promise<string> {
  const all = await getCredentials("shiphero");
  if (all.access_token && isStillFresh(all.access_token_expires_at)) {
    return all.access_token;
  }

  const { SHIPHERO_REFRESH_TOKEN } = await requireCredentials("shiphero", [
    "SHIPHERO_REFRESH_TOKEN",
  ]);

  const { accessToken, expiresAt } = await mintAccessToken(
    SHIPHERO_REFRESH_TOKEN,
  );
  await setCredentials("shiphero", {
    access_token: accessToken,
    access_token_expires_at: expiresAt,
  });
  return accessToken;
}
