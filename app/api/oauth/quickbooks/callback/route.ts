import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  getCredentials,
  setCredentials,
} from "@/lib/connectors/credentials";

// QuickBooks OAuth — step 2: exchange the authorization code for tokens.
//
// Verifies state cookie HMAC, calls Intuit's tokens/bearer endpoint with Basic
// auth (client_id:client_secret), persists the resulting access + refresh
// tokens (plus realm_id + expiries) to connector_credentials.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTUIT_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const STATE_COOKIE = "qb_oauth_state";
const STATE_TTL_MS = 600_000;

type IntuitTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
};

function getStateSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to verify OAuth state");
  }
  return s;
}

function hmacState(timestamp: string, nonce: string): string {
  return crypto
    .createHmac("sha256", getStateSecret())
    .update(`${timestamp}:${nonce}`)
    .digest("hex");
}

function isoFromNowSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function redirectWithError(origin: string, error: string): NextResponse {
  const url = new URL(`${origin}/settings`);
  url.searchParams.set("qb", "error");
  url.searchParams.set("qb_error", error);
  const res = NextResponse.redirect(url.toString());
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { origin, searchParams } = url;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      `${origin}/login?next=${encodeURIComponent("/settings")}`,
    );
  }

  const intuitError = searchParams.get("error");
  if (intuitError) {
    return redirectWithError(origin, intuitError);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realmId = searchParams.get("realmId");
  if (!code || !state || !realmId) {
    return redirectWithError(origin, "missing_oauth_params");
  }

  const cookie = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookie) {
    return redirectWithError(origin, "state_cookie_missing");
  }
  let parsed: { timestamp?: string; nonce?: string };
  try {
    parsed = JSON.parse(cookie);
  } catch {
    return redirectWithError(origin, "state_cookie_invalid");
  }
  const { timestamp, nonce } = parsed;
  if (!timestamp || !nonce) {
    return redirectWithError(origin, "state_cookie_incomplete");
  }
  const expected = hmacState(timestamp, nonce);
  // timingSafeEqual requires equal-length buffers; cheap length check first.
  if (
    expected.length !== state.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(state))
  ) {
    return redirectWithError(origin, "state_mismatch");
  }
  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) {
    return redirectWithError(origin, "state_expired");
  }

  const creds = await getCredentials("quickbooks");
  const clientId = creds.client_id;
  const clientSecret = creds.client_secret;
  if (!clientId || !clientSecret) {
    return redirectWithError(origin, "client_credentials_missing");
  }

  const redirectUri = `${origin}/api/oauth/quickbooks/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf-8").toString(
    "base64",
  );

  const tokenRes = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    return redirectWithError(
      origin,
      `token_exchange_failed_${tokenRes.status}`,
    );
  }
  let token: IntuitTokenResponse;
  try {
    token = JSON.parse(tokenText) as IntuitTokenResponse;
  } catch {
    return redirectWithError(origin, "token_response_invalid");
  }

  await setCredentials(
    "quickbooks",
    {
      realm_id: realmId,
      access_token: token.access_token,
      access_token_expires_at: isoFromNowSeconds(token.expires_in),
      refresh_token: token.refresh_token,
      refresh_token_expires_at: isoFromNowSeconds(
        token.x_refresh_token_expires_in,
      ),
    },
    user.id,
  );

  const success = NextResponse.redirect(`${origin}/settings?qb=connected`);
  success.cookies.delete(STATE_COOKIE);
  return success;
}
