import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCredential } from "@/lib/connectors/credentials";

// QuickBooks OAuth — step 1: bounce the user to Intuit's consent screen.
//
// Session-gated. Reads client_id from connector_credentials (no env fallback).
// On missing client_id, redirects back to /settings with a hint.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const SCOPE = "com.intuit.quickbooks.accounting";
const STATE_COOKIE = "qb_oauth_state";
const STATE_TTL_SECONDS = 600;

function getStateSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to sign OAuth state");
  }
  return s;
}

function hmacState(timestamp: string, nonce: string): string {
  return crypto
    .createHmac("sha256", getStateSecret())
    .update(`${timestamp}:${nonce}`)
    .digest("hex");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { origin } = new URL(request.url);
    return NextResponse.redirect(
      `${origin}/login?next=${encodeURIComponent("/settings")}`,
    );
  }

  const { origin } = new URL(request.url);
  const clientId = await getCredential("quickbooks", "client_id");
  if (!clientId) {
    return NextResponse.redirect(`${origin}/settings?qb=needs-client-id`);
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = hmacState(timestamp, nonce);

  const redirectUri = `${origin}/api/oauth/quickbooks/callback`;
  const authorize = new URL(INTUIT_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", SCOPE);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize.toString());
  response.cookies.set(STATE_COOKIE, JSON.stringify({ timestamp, nonce }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
