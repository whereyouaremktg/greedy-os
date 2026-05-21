import "server-only";

/**
 * Dev Dashboard apps no longer expose a one-time shpat_ in the admin UI.
 * They use the client credentials grant (24h tokens). Legacy custom apps may
 * still set SHOPIFY_ADMIN_ACCESS_TOKEN directly.
 */
export async function resolveShopifyAccessToken(
  storeDomain: string,
): Promise<string> {
  const staticToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (staticToken) return staticToken;

  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Shopify credentials missing: set SHOPIFY_ADMIN_ACCESS_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (Dev Dashboard app)",
    );
  }

  const host = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`https://${host}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Shopify client_credentials failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  let json: { access_token?: string };
  try {
    json = JSON.parse(text) as { access_token?: string };
  } catch {
    throw new Error(
      `Shopify client_credentials returned non-JSON (often HTML): ${text.slice(0, 200)}`,
    );
  }

  if (!json.access_token) {
    throw new Error("Shopify client_credentials: response missing access_token");
  }

  return json.access_token;
}
