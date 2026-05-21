# Settings UI — feedback-driven layer over env-only credentials

## Why this exists

The original Phase 0 plan stored every connector credential in Vercel
environment variables. That's fine for the developer setting things up,
but the operators (Paul + Marissa) shouldn't need a Vercel login — and
the experience of pasting a HubSpot Private App token into a CLI is not
"standard integration" UX.

This `/settings` page was added in response to user feedback: a Settings
tab where keys can be pasted in like Stripe, Slack, Shopify, etc.

## How it works

- **Storage:** `public.connector_credentials` table (`(connector, key)` PK).
  Migration `0003_connector_credentials.sql`. RLS is enabled with **no
  policies**, which means authenticated clients cannot read values from
  Supabase directly — only the service-role client can. Stored plaintext,
  acceptable for the current two-user single-tenant trust model.
- **Read path:** `lib/connectors/credentials.ts` exposes
  `getCredential(connector, key)` and `requireCredential(connector, key)`.
  Resolution order is **DB first → process env fallback**, so any value
  set in Vercel still works if nothing is pasted in the UI.
- **Write path:** server actions in `lib/actions/settings.ts`
  (`saveConnectorCredentials`, `clearConnector`) use the service-role
  client. The auth check uses the cookie-bound server client so only
  signed-in users can write. Values never echo back to the client; the
  UI re-reads status only.
- **UI:** `app/(app)/settings/page.tsx` is a server component that
  fetches per-connector status. Each card (`components/settings/connector-card.tsx`)
  shows per-field source badges:
  - `Saved` — value is in Supabase
  - `Env var` — value comes from Vercel env (not yet overridden in UI)
  - (none)  — not configured anywhere
  The card pill summarizes the whole connector as **Connected**,
  **Partial**, or **Not connected**.

## Wiring a puller into the credentials helper

Replace direct `process.env.X` reads with the helper. Example (HubSpot,
`lib/pullers/hubspot.ts`):

```ts
const token = await requireCredential(
  "hubspot",
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "Create a HubSpot Private App with the read scopes.",
);
```

Currently wired: **HubSpot**. The other three pullers (Shopify, Klaviyo,
QuickBooks) still read `process.env.X` directly. When their next agent
touches them they should switch to `requireCredential(...)` so the
Settings UI controls them too.

## Adding a new connector / field

1. Add an entry to `CONNECTORS` in `lib/connectors/credentials.ts` (id,
   label, description, fields).
2. The Settings page will render it automatically.
3. In the puller, read values via `getCredential(...)` / `requireCredential(...)`.
4. No migration needed — the `(connector, key)` rows are free-form text.
