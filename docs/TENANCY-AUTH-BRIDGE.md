# Glow OS — Tenancy Auth Bridge (Runtime Side of the RLS Bridge)

**Status:** Phase 2 preview. **Reference only — NOT wired into the app.**
**Companion to:** `docs/PHASE1-MIGRATION-SPEC.md` (the SQL side). This document specifies the **runtime** half of the same bridge: how a request acquires the `org_id` (+ `role`) claim that `public.current_org_ids()` reads, so RLS on the merchant surface actually scopes to a tenant.

> Every TypeScript snippet below is a **Phase 2 preview**. None of it is imported by the app today; none of these files exist in `lib/` yet. They are written to be drop-in once Phase 2 begins, but **must not be added to the build in this phase** — see the cutover gate in `PHASE1-MIGRATION-SPEC.md` §0/§11. Paths proposed below (`lib/tenancy/*`, `lib/admin/*`) are suggestions, not existing modules.

---

## 0. What problem this solves, and what it deliberately does NOT

The SQL migration makes `public.current_org_ids()` resolve a tenant from **two** inputs:

```sql
-- 0015_tenancy_foundation.sql (already authored)
select (auth.jwt() ->> 'org_id')::uuid          -- (a) MERCHANT surface: claim in the Supabase JWT
where  nullif(auth.jwt() ->> 'org_id', '') is not null
union
select m.org_id from public.memberships m       -- (b) STAFF surface: Supabase-authed user's memberships
where  m.user_id = auth.uid();
```

Branch **(b)** already works today: internal staff log in with real Supabase Auth, and their `auth.uid()` resolves through `memberships`. The `/admin` back-office (§5) rides entirely on this branch plus `platform_admins`.

Branch **(a)** is **vaporware until this runtime bridge exists.** A Shopify merchant embedded-app request arrives with a **Shopify session token**, not a Supabase session. Nothing in the app mints a Supabase JWT carrying `org_id`, so for a merchant `auth.jwt() ->> 'org_id'` is `NULL`, `current_org_ids()` returns the empty set, and every merchant RLS read/write is denied. This document is the missing piece: **verify the Shopify token → resolve the org → mint a short-lived Supabase-compatible JWT carrying `org_id` + `role` → hand it to a Supabase RLS client.**

**Scope boundary — read this twice.** This bridge secures the **merchant RLS surface only**. It does **nothing** for the service-role hazards in `PHASE1-MIGRATION-SPEC.md` §0 (the unscoped puller deletes, the Slack `po_payments` updates, `deleteCredentials`). Those run under `createServiceClient()`, which **bypasses RLS entirely** — no JWT, no `org_id` claim, no policy evaluation. A correct auth bridge does not make a single one of those writes safe. The cutover gate (one tenant + the second-tenant tripwire) is what protects them; this bridge is orthogonal. Do not let "auth is done" become "tenancy is done."

---

## 1. Where the two Supabase clients fit (`server.ts`, `service.ts`)

The repo already has the two clients this bridge slots between. Neither changes in Phase 1; the bridge adds a **third** construction path for merchants and reuses the existing two unchanged for staff/service.

| Client | File (today) | Auth identity | RLS | Used by | Role in this bridge |
|---|---|---|---|---|---|
| **Cookie/SSR client** | `lib/supabase/server.ts` → `createClient()` | The logged-in **Supabase** user from cookies (`anon` key + cookie session) | **Enforced** | Staff app pages, `/admin`, current `app/api/chat/route.ts` | Backs the **staff** branch (b) and `/admin` (§5). Unchanged. |
| **Service-role client** | `lib/supabase/service.ts` → `createServiceClient()` | None (service-role key) | **Bypassed** | Pullers, Slack AI-tool path, cron | Out of scope for this bridge. RLS never runs here; safety is the cutover gate, not a claim. **Never use this on the merchant path.** |
| **Merchant RLS client** (Phase 2 preview, new) | `lib/tenancy/merchant-client.ts` (proposed) | A **minted** Supabase JWT carrying `org_id` + `role` | **Enforced** | Embedded Shopify app requests | The new path §2–§4 builds. Uses the `anon` key transport but presents the minted JWT as the bearer, so `auth.jwt()` is populated and branch (a) fires. |

The critical property: the merchant client is an **RLS-enforced** client (like `server.ts`), **never** the service-role client. It differs from `server.ts` only in *where the JWT comes from* — minted from a verified Shopify token instead of read from a Supabase cookie session. Everything downstream (`buildGlowContext`, server actions, the JWT-claim column default in `PHASE1-MIGRATION-SPEC.md` §3a) then works unchanged because, from Postgres's view, it is just another authenticated request with an `org_id` claim.

```
                         ┌─────────────────────────── STAFF ───────────────────────────┐
  Supabase cookie session ─→ createClient() [server.ts] ─→ auth.uid() ─→ memberships ──┐
                                                                                        │
                         ┌────────────────────────── MERCHANT ─────────────────────────┤→ current_org_ids()
  Shopify session token ─→ verifyShopifySessionToken() (§2)                             │   (0015)
                         ─→ resolve org by shop_domain (§3)                             │
                         ─→ mintSupabaseJwt({org_id, role}) (§3)                        │
                         ─→ merchant RLS client w/ minted JWT ─→ auth.jwt()->>'org_id' ─┘

  Service role (pullers/Slack) ─→ createServiceClient() [service.ts] ─→ RLS BYPASSED (gate-protected, §0)
```

---

## 2. Verifying a Shopify session token

A Shopify **session token** (App Bridge `getSessionToken()`, sent as `Authorization: Bearer <jwt>`) is a JWT signed **HS256 with the app's client secret** (`SHOPIFY_CLIENT_SECRET`, already in the env). Verification is local — no network call to Shopify. We verify signature, standard time claims, audience (`aud === SHOPIFY_CLIENT_ID`), and that `dest`/`iss` point at a real `*.myshopify.com` shop. The verified `dest` host **is the tenant key** — it joins to `organizations.shop_domain`.

> Dependency note: the repo has **no JWT library** today (`@shopify/admin-api-client` does API calls, not token verification). This bridge introduces **`jose`** for both verify (§2) and mint (§3). Add `jose` to `package.json` only when Phase 2 starts — not now.

### Claims we rely on (Shopify session token)

| Claim | Meaning | Check |
|---|---|---|
| `iss` | `https://{shop}.myshopify.com/admin` | host must equal `dest` host; must be `*.myshopify.com` |
| `dest` | `https://{shop}.myshopify.com` | **the shop domain → tenant key** |
| `aud` | the app's API key | must equal `SHOPIFY_CLIENT_ID` |
| `sub` | the Shopify user id | carried through for audit; not the tenant key |
| `exp`/`nbf`/`iat` | validity window | session tokens are ~1 min lived; enforce with small leeway |
| `jti` | token id | optional replay defense (out of scope Phase 2 preview) |

```ts
// === PHASE 2 PREVIEW — NOT WIRED IN ===
// Proposed: lib/tenancy/shopify-session.ts
// Verifies a Shopify App Bridge session token locally with the app client secret.
// No network call. Throws ShopifySessionError on any failure (fail-closed).
import { jwtVerify, type JWTPayload } from "jose";

const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET; // HS256 signing key
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID; // expected `aud`

export class ShopifySessionError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "missing_secret"
      | "missing_bearer"
      | "bad_signature"
      | "bad_audience"
      | "bad_dest"
      | "expired",
  ) {
    super(message);
    this.name = "ShopifySessionError";
  }
}

export interface VerifiedShopifySession {
  /** Normalized shop host, e.g. "glow.myshopify.com" — the tenant key. */
  shopDomain: string;
  /** Shopify user id from `sub`, for best-effort audit. */
  shopifyUserId: string;
  /** Raw verified payload, if a caller needs more. */
  payload: JWTPayload;
}

/** Pull the bearer token off a Request without trusting anything else about it. */
export function bearerFrom(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) throw new ShopifySessionError("no bearer token", "missing_bearer");
  return m[1];
}

export async function verifyShopifySessionToken(
  token: string,
): Promise<VerifiedShopifySession> {
  if (!SHOPIFY_CLIENT_SECRET || !SHOPIFY_CLIENT_ID) {
    throw new ShopifySessionError(
      "SHOPIFY_CLIENT_SECRET / SHOPIFY_CLIENT_ID not configured",
      "missing_secret",
    );
  }

  const key = new TextEncoder().encode(SHOPIFY_CLIENT_SECRET);

  let payload: JWTPayload;
  try {
    // jose enforces exp/nbf signature itself; clockTolerance covers the ~1min TTL.
    ({ payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      audience: SHOPIFY_CLIENT_ID, // throws if `aud` !== client id
      clockTolerance: 5, // seconds
    }));
  } catch (err) {
    const expired =
      err instanceof Error && err.name === "JWTExpired" ? "expired" : "bad_signature";
    throw new ShopifySessionError(`session token rejected: ${String(err)}`, expired);
  }

  // dest is the shop origin; iss must agree. Reject anything not *.myshopify.com.
  const dest = typeof payload.dest === "string" ? payload.dest : "";
  const iss = typeof payload.iss === "string" ? payload.iss : "";
  let shopDomain: string;
  try {
    const destHost = new URL(dest).host.toLowerCase();
    const issHost = new URL(iss).host.toLowerCase();
    if (destHost !== issHost) throw new Error("dest/iss host mismatch");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(destHost)) {
      throw new Error("not a myshopify host");
    }
    shopDomain = destHost;
  } catch (e) {
    throw new ShopifySessionError(`bad dest/iss: ${String(e)}`, "bad_dest");
  }

  return {
    shopDomain,
    shopifyUserId: typeof payload.sub === "string" ? payload.sub : "",
    payload,
  };
}
```

**Why local HS256 verification, not an OAuth callback:** the session token is the *embedded-app* credential App Bridge hands the frontend on every request; it is the standard, intended way to authenticate per-request embedded-app calls. The offline **Admin API access token** (per `shopify_dev_dashboard_auth.md` — `client_credentials` grant) is a *separate* secret stored per-tenant in `connector_credentials`; it is for the puller's API calls, **not** for authenticating an incoming user request. Do not conflate them.

---

## 3. Minting a Supabase-compatible JWT carrying `org_id` (+ `role`)

After verification we have a `shopDomain`. The bridge:

1. **Resolves the org** by `shop_domain` (the install-time idempotency key from `PHASE1-MIGRATION-SPEC.md` §1). This lookup uses the **service-role** client (`service.ts`) because the request has no Supabase identity *yet* — there is nothing for RLS to scope to until we mint the claim. This is the single sanctioned service-role read on the merchant request path, and it reads only `organizations` (no tenant data), so it leaks nothing.
2. **Mints a short-lived Supabase JWT** signed with the project's **JWT secret**, carrying the claims Supabase + our RLS require: `role: "authenticated"`, `aud: "authenticated"`, a `sub`, and — the load-bearing part — **`org_id`** (what `current_org_ids()` reads via `auth.jwt() ->> 'org_id'`) plus **`role`** (the org role, for app-level checks; distinct from the Postgres `role` claim, see the naming note below).

> **Supabase signing-key note.** `current_org_ids()` reads the claim through `auth.jwt()`, which works for *any* JWT Supabase/PostgREST accepts. For PostgREST to accept a hand-minted token it must be signed with the key PostgREST trusts. On the **legacy** symmetric setup that is the project **JWT secret** (HS256) — the snippet below assumes this and expects `SUPABASE_JWT_SECRET` in the env (not present today; add in Phase 2). If the project has migrated to **asymmetric JWT signing keys**, mint with the project's current private signing key (RS256/ES256 via `jose`) instead and drop `SUPABASE_JWT_SECRET`. Either way the *claim shape* below is identical — only the signing key/alg differs. Confirm which signing mode the project uses before authoring the final version.

### Claim-name collision (must-read)

There are **two different `role`s**:

- **Postgres role claim** — Supabase/PostgREST reads the JWT's top-level **`role`** and `SET ROLE`s to it. For an authenticated merchant this MUST be the string **`"authenticated"`**, or RLS policies scoped `to authenticated` won't apply and PostgREST may reject the request.
- **Org role** — our `owner|admin|member` (the `public.org_role` enum). This is application metadata. It must **not** clobber the Postgres `role` claim. Carry it under a **distinct** claim name — below it lives at **`org_role`** (and, redundantly for app convenience, inside `app_metadata`). `requireOrg()` (§4) reads `org_role`; Postgres reads `role`. Never put the org role in the top-level `role` claim.

```ts
// === PHASE 2 PREVIEW — NOT WIRED IN ===
// Proposed: lib/tenancy/mint-jwt.ts
// Mints a short-lived Supabase-compatible JWT carrying the org_id + org_role
// claims that current_org_ids() (0015) and requireOrg() (§4) read.
import { SignJWT } from "jose";
import type { OrgRole } from "@/lib/tenancy/types"; // = "owner" | "admin" | "member"

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET; // legacy symmetric secret
const MINTED_TTL_SECONDS = 60 * 5; // short — re-mint per request batch from the Shopify token

export interface MintInput {
  orgId: string; // organizations.id (uuid) — becomes the org_id claim
  orgRole: OrgRole; // becomes the org_role claim (NOT the top-level Postgres `role`)
  shopDomain: string; // audit/debug only
  subject?: string; // optional stable subject; falls back to org:<id>
}

export async function mintSupabaseJwt(input: MintInput): Promise<string> {
  if (!SUPABASE_JWT_SECRET) {
    throw new Error("mintSupabaseJwt: SUPABASE_JWT_SECRET not configured");
  }
  const key = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    // --- Postgres / PostgREST contract ---
    role: "authenticated", // <-- the SET ROLE target. DO NOT put org role here.
    // --- the RLS bridge claim (read by current_org_ids via auth.jwt()->>'org_id') ---
    org_id: input.orgId,
    // --- org role for app-level checks (distinct claim, never overrides `role`) ---
    org_role: input.orgRole,
    shop_domain: input.shopDomain,
    // mirror into app_metadata so supabase-js helpers surface it too
    app_metadata: { org_id: input.orgId, org_role: input.orgRole, provider: "shopify" },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + MINTED_TTL_SECONDS)
    .setAudience("authenticated")
    .setSubject(input.subject ?? `org:${input.orgId}`)
    .sign(key);
}
```

### Org resolution + merchant RLS client construction

```ts
// === PHASE 2 PREVIEW — NOT WIRED IN ===
// Proposed: lib/tenancy/merchant-client.ts
// Resolves the org for a verified shop and builds an RLS-ENFORCED Supabase client
// whose bearer is the minted JWT. This is the third client path described in §1.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/db";
import { createServiceClient } from "@/lib/supabase/service";
import { mintSupabaseJwt } from "@/lib/tenancy/mint-jwt";
import type { OrgRole } from "@/lib/tenancy/types";

export class OrgResolutionError extends Error {
  constructor(readonly shopDomain: string) {
    super(`no active organization for shop ${shopDomain}`);
    this.name = "OrgResolutionError";
  }
}

interface ResolvedOrg {
  orgId: string;
  orgRole: OrgRole;
}

/**
 * Look up the org by shop_domain. Uses service-role ONLY because the request has
 * no Supabase identity yet — this is the one sanctioned service-role read on the
 * merchant path, and it touches only `organizations` (no tenant data).
 *
 * Phase-2 NOTE on role: merchants have no membership row (memberships is
 * staff-only, PHASE1-MIGRATION-SPEC §1). The org_role for a merchant therefore
 * comes from the *install/billing* relationship, not memberships. Until that
 * model exists, default merchant requests to "member"; an owner/admin distinction
 * for merchant users is a separate Phase-2+ decision. Do NOT read it from
 * memberships for the merchant path.
 */
async function resolveOrgForShop(shopDomain: string): Promise<ResolvedOrg> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("organizations")
    .select("id, status")
    .eq("shop_domain", shopDomain)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") throw new OrgResolutionError(shopDomain);
  return { orgId: data.id, orgRole: "member" };
}

export interface MerchantContext {
  shop: string;
  orgId: string;
  role: OrgRole;
  supabase: ReturnType<typeof createSupabaseClient<Database>>;
}

/** Build an RLS-enforced client bound to the minted JWT (NOT service-role). */
export async function merchantClientForShop(
  shopDomain: string,
): Promise<MerchantContext> {
  const { orgId, orgRole } = await resolveOrgForShop(shopDomain);
  const jwt = await mintSupabaseJwt({ orgId, orgRole, shopDomain });

  // anon key as transport, minted JWT as the bearer => RLS sees an authenticated
  // request whose auth.jwt()->>'org_id' is set. This is the merchant analogue of
  // server.ts; it is emphatically NOT createServiceClient().
  const supabase = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  return { shop: shopDomain, orgId, role: orgRole, supabase };
}
```

**Why mint at all instead of `setSession`:** the merchant never has a Supabase refresh-token session; minting a stateless, short-lived access token per request batch avoids inventing fake Supabase user rows and keeps `auth.users` strictly for **staff**. The minted token carries exactly the claims RLS needs and expires fast, so a leaked token is low-value. The merchant's *durable* identity stays Shopify's; Supabase is used only as the RLS-claim transport.

---

## 4. `requireOrg()` — the merchant server helper

`requireOrg()` is the single entry point a merchant-facing route/handler calls. It performs verify → resolve → mint → client in one place and returns `{ shop, orgId, role }` **plus** the bound RLS client. It fails closed: any verification, resolution, or config failure throws (caller maps to 401/403).

```ts
// === PHASE 2 PREVIEW — NOT WIRED IN ===
// Proposed: lib/tenancy/require-org.ts
import "server-only";
import {
  bearerFrom,
  verifyShopifySessionToken,
  ShopifySessionError,
} from "@/lib/tenancy/shopify-session";
import {
  merchantClientForShop,
  OrgResolutionError,
  type MerchantContext,
} from "@/lib/tenancy/merchant-client";

export interface RequireOrgResult {
  shop: string; // verified *.myshopify.com domain
  orgId: string; // organizations.id — also the minted org_id claim
  role: "owner" | "admin" | "member"; // org role (NOT the Postgres role claim)
  /** RLS-enforced client bound to the minted JWT. Use this for all merchant data. */
  supabase: MerchantContext["supabase"];
}

/**
 * Authenticate a merchant embedded-app request and return its tenant context.
 * Throws ShopifySessionError (401) or OrgResolutionError (403) on failure.
 *
 * Usage (Phase 2): const { orgId, role, supabase } = await requireOrg(request);
 * Then every supabase query is auto-scoped by RLS to that org via current_org_ids().
 */
export async function requireOrg(request: Request): Promise<RequireOrgResult> {
  const token = bearerFrom(request); // throws ShopifySessionError if absent
  const session = await verifyShopifySessionToken(token); // §2
  const ctx = await merchantClientForShop(session.shopDomain); // §3
  return { shop: ctx.shop, orgId: ctx.orgId, role: ctx.role, supabase: ctx.supabase };
}

export { ShopifySessionError, OrgResolutionError };
```

**How a Phase-2 merchant route would use it** (illustrative — *do not add now*; contrast with today's `app/api/chat/route.ts:16-21`, which calls `createClient()` + `supabase.auth.getUser()` for the **staff** path):

```ts
// === PHASE 2 PREVIEW — illustrative only ===
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireOrg(request);
  } catch (e) {
    if (e instanceof ShopifySessionError) return new Response("Unauthorized", { status: 401 });
    if (e instanceof OrgResolutionError) return new Response("Forbidden", { status: 403 });
    throw e;
  }
  // ctx.supabase is RLS-scoped to ctx.orgId. Reads/writes need no manual
  // .eq("tenant_id", …) on the OWNED tables — the policy + the JWT-claim column
  // DEFAULT (PHASE1-MIGRATION-SPEC §3a) handle scoping and stamping.
  const { data } = await ctx.supabase.from("vendors").select("*"); // only this org's rows
  // ...
}
```

**The one subtlety the column default does not cover** (`PHASE1-MIGRATION-SPEC.md` §3a): the JWT-claim `DEFAULT` fires only for inserts that **omit** `tenant_id`. A supabase-js `upsert(..., { onConflict: ... })` that sends an explicit column set, or any service-role write, will **not** get the default. The merchant RLS surface (plain inserts via the bound client) is covered; everything else stamps `tenant_id` explicitly per the §11 checklist. `requireOrg()` makes the *merchant* side correct — it does not absolve the service-role side.

**`role` is advisory in Phase 2.** The returned `role` is for app-level UI/permission gating (e.g. hide a destructive button from `member`). It is **not** an RLS input — RLS scopes by `org_id` only. Do not build security-critical authorization on the merchant `role` until the merchant-role model (membership/billing-derived) is real; today it is a constant `"member"`.

---

## 5. The internal `/admin` back-office — real Supabase Auth + `platform_admins`

`/admin` is **not** a merchant surface and does **not** use this bridge at all. It uses the path that already works:

- **Authentication:** real **Supabase Auth** via the existing cookie client `createClient()` in `lib/supabase/server.ts` — i.e. `supabase.auth.getUser()`, exactly like the current staff app. No Shopify token, no minted JWT, no `org_id` claim.
- **Authorization:** membership in **`public.platform_admins`** (the `user_id` allowlist seeded in `0015`). The DB gate is `public.is_platform_admin()`; the app gate is a thin server helper that checks the same table for the logged-in user before rendering any `/admin` route.
- **Cross-tenant reach:** because the request carries no `org_id` claim, `current_org_ids()` resolves an admin through the **memberships** branch (b) — but the **Class-4 `"platform cross-tenant read"`** policies (`PHASE1-MIGRATION-SPEC.md` §5) widen `SELECT` to all tenants for anyone passing `is_platform_admin()`. So `/admin` reads across tenants **without** the service-role client and **without** a tenant claim. Reads only — there is no cross-tenant write override in Phase 1.

```ts
// === PHASE 2 PREVIEW — NOT WIRED IN ===
// Proposed: lib/admin/require-platform-admin.ts
// Staff-only gate for /admin. Real Supabase Auth + platform_admins.
// Deliberately the OPPOSITE of requireOrg(): NO Shopify token, NO minted JWT,
// NO org_id claim — staff authority comes from auth.users + platform_admins.
import "server-only";
import { createClient } from "@/lib/supabase/server"; // the existing cookie/SSR client

export class NotPlatformAdminError extends Error {
  constructor() {
    super("not a platform admin");
    this.name = "NotPlatformAdminError";
  }
}

export interface PlatformAdminContext {
  userId: string;
  email: string | null;
  /** RLS-enforced cookie client. Class-4 policies give it cross-tenant READ. */
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new NotPlatformAdminError();

  // App-level gate mirroring the DB's is_platform_admin(). RLS on platform_admins
  // ("platform_admins admin all", 0015) already restricts this read to admins, so
  // a non-admin gets no row -> denied. Belt-and-suspenders with the SQL gate.
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotPlatformAdminError();

  return { userId: user.id, email: user.email ?? null, supabase };
}
```

**Why `/admin` must not borrow `requireOrg()` or `createServiceClient()`:**
- Using `requireOrg()` would force a Shopify token onto a staff user who has none — nonsensical.
- Using `createServiceClient()` for `/admin` reads would **bypass RLS** and silently discard the very tenant-scoping the migration installs, re-opening the cross-tenant leak the spec closes. `/admin` reads cross-tenant **through RLS** (Class-4), not around it. The service-role client stays confined to pullers/cron/Slack, exactly as `service.ts`'s own header comment states.

---

## 6. Three identities, one diagram (summary)

| Surface | Credential in | Client | `current_org_ids()` branch | Cross-tenant? |
|---|---|---|---|---|
| **Merchant** (embedded app) | Shopify session token → minted Supabase JWT | merchant RLS client (§3, minted bearer) | (a) `org_id` claim | No — single org |
| **Staff app** (today) | Supabase cookie session | `server.ts` `createClient()` | (b) memberships | Their member orgs only |
| **`/admin` back-office** | Supabase cookie session + `platform_admins` | `server.ts` `createClient()` | (b) memberships + Class-4 read override | **Read** all tenants |
| **Service** (pullers/Slack/cron) | service-role key | `service.ts` `createServiceClient()` | — (RLS bypassed) | Unbounded — **gate-protected only** (§0) |

---

## 7. Phase-2 build checklist for this bridge (do NOT start in this phase)

Gated behind the same cutover gate as `PHASE1-MIGRATION-SPEC.md` §11 — i.e. blocked until single-tenant safety is no longer the only thing standing between prod and a cross-tenant leak, AND the SQL files `0015`–`0021` (named `0015_tenancy_foundation`…`0018_rls_rewrite` in the repo today; reconcile numbering before applying) are applied.

1. Add **`jose`** to `package.json` (verify/mint). Confirm the project's Supabase JWT signing mode (legacy `SUPABASE_JWT_SECRET` symmetric vs asymmetric signing keys) and pick the mint key/alg accordingly (§3 note).
2. Add env: `SUPABASE_JWT_SECRET` (or wire the asymmetric signing key). `SHOPIFY_CLIENT_SECRET` / `SHOPIFY_CLIENT_ID` already exist.
3. Author `lib/tenancy/{types,shopify-session,mint-jwt,merchant-client,require-org}.ts` and `lib/admin/require-platform-admin.ts` from the previews above. **Do not** modify `server.ts` or `service.ts`.
4. Decide the **merchant `org_role`** source (install/billing relationship, not `memberships`); until then default `"member"` and treat `role` as advisory (§4).
5. Wire `requireOrg()` into the merchant embedded-app route(s) only. Keep `app/api/chat/route.ts` and other staff routes on `createClient()`/`auth.getUser()`.
6. Gate every `/admin` route with `requirePlatformAdmin()`; never reach for `createServiceClient()` there.
7. Independent of this bridge, land all §11 service-role fixes — this bridge does **not** make them unnecessary (§0).
