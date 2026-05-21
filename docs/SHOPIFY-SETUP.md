# Shopify credentials for Glow OS

## Why you don't see `shpat_` in the admin UI

If your app was created in the **Shopify Dev Dashboard** (Partners) and installed on the store, Shopify **no longer shows a one-time Admin API access token** in the store admin. That UI path only applies to older **Develop apps** created inside the store.

Dev Dashboard apps use the **client credentials** grant instead:

```bash
curl -X POST "https://YOUR_STORE.myshopify.com/admin/oauth/access_token" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

Response includes `access_token` (works like `shpat_`) and `expires_in: 86399` (~24 hours).

Glow OS exchanges this **automatically on each cron run** when you set:

```bash
SHOPIFY_STORE_DOMAIN=glow-beauty-hair.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
```

Optional fallback for legacy store custom apps:

```bash
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
```

## Verify with Shopify CLI (testing only)

```bash
npm install -g @shopify/cli@latest
shopify store auth --store glow-beauty-hair.myshopify.com --scopes read_orders
shopify store execute --store glow-beauty-hair.myshopify.com --query '{ shop { name } }'
```

CLI stores a short-lived session locally — it does **not** replace `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` on Vercel.

## Vercel env vars

Add for **Production** and **Development**:

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

Do **not** use `atkn_` automation tokens — they are for CLI deploy only.

## Test cron locally

```bash
# .env.local — restart pnpm dev after edits
export $(grep '^CRON_SECRET=' .env.local | xargs)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/shopify
```

Expected: `{"ok":true,"rows":30}`
