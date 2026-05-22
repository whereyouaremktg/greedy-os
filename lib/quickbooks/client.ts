import "server-only";
import {
  getCredentials,
  setCredentials,
  MissingCredentialsError,
} from "@/lib/connectors/credentials";

const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const PROD_API_HOST = "https://quickbooks.api.intuit.com";
const SANDBOX_API_HOST = "https://sandbox-quickbooks.api.intuit.com";

// Refresh the access token if it expires within this many seconds.
const REFRESH_LEAD_SECONDS = 60;

const REQUIRED_KEYS = [
  "client_id",
  "client_secret",
  "refresh_token",
  "realm_id",
] as const;

type IntuitTokenResponse = {
  access_token: string;
  refresh_token: string;
  // Access-token TTL, seconds (typically 3600).
  expires_in: number;
  // Refresh-token TTL, seconds (typically 8726400 = ~101 days).
  x_refresh_token_expires_in: number;
  token_type: string;
};

export class QboApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.name = "QboApiError";
    this.status = status;
    this.detail = detail;
  }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return (
    "Basic " +
    Buffer.from(`${clientId}:${clientSecret}`, "utf-8").toString("base64")
  );
}

// Exchange a refresh_token for a fresh access_token + rotated refresh_token.
// Intuit rotates refresh_token on every refresh call.
async function refreshAccessToken(creds: {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}): Promise<IntuitTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
  });

  const res = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(creds.client_id, creds.client_secret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new QboApiError(
      res.status,
      text,
      `QuickBooks token refresh failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  try {
    return JSON.parse(text) as IntuitTokenResponse;
  } catch {
    throw new QboApiError(
      res.status,
      text,
      `QuickBooks token refresh returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
}

function isoFromNowSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// Returns a valid access token + the realm id to call against. Refreshes
// the access token if absent or within REFRESH_LEAD_SECONDS of expiry, and
// persists the rotated refresh_token via setCredentials.
export async function getAccessToken(): Promise<{
  accessToken: string;
  realmId: string;
}> {
  const all = await getCredentials("quickbooks");
  const missing = REQUIRED_KEYS.filter((k) => !all[k]);
  if (missing.length > 0) {
    throw new MissingCredentialsError("quickbooks", missing);
  }

  const accessToken = all.access_token;
  const expiresAt = all.access_token_expires_at;
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const needsRefresh =
    !accessToken ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs - Date.now() < REFRESH_LEAD_SECONDS * 1000;

  if (!needsRefresh) {
    return { accessToken: accessToken as string, realmId: all.realm_id };
  }

  const fresh = await refreshAccessToken({
    client_id: all.client_id,
    client_secret: all.client_secret,
    refresh_token: all.refresh_token,
  });

  await setCredentials("quickbooks", {
    access_token: fresh.access_token,
    access_token_expires_at: isoFromNowSeconds(fresh.expires_in),
    refresh_token: fresh.refresh_token,
    refresh_token_expires_at: isoFromNowSeconds(
      fresh.x_refresh_token_expires_in,
    ),
  });

  return { accessToken: fresh.access_token, realmId: all.realm_id };
}

function apiHostFor(env: string | undefined): string {
  return env?.toLowerCase() === "sandbox" ? SANDBOX_API_HOST : PROD_API_HOST;
}

// Authenticated fetch against the QBO v3 company endpoint. Caller passes the
// path beginning with "/" (e.g. "/reports/BalanceSheet?date_macro=Today").
export async function qboFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const { accessToken, realmId } = await getAccessToken();
  const all = await getCredentials("quickbooks");
  const host = apiHostFor(all.env);

  const url = `${host}/v3/company/${encodeURIComponent(realmId)}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    let detail: unknown;
    const text = await res.text();
    try {
      detail = JSON.parse(text);
    } catch {
      detail = text;
    }
    throw new QboApiError(
      res.status,
      detail,
      `QBO API ${res.status} ${path}: ${
        typeof detail === "string"
          ? detail.slice(0, 300)
          : JSON.stringify(detail).slice(0, 300)
      }`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
