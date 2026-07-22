-- Glow OS — Phase 1 multi-tenant FOUNDATION.
-- New PLATFORM tables: organizations, memberships, platform_admins.
-- Helper functions: current_org_ids(), is_platform_admin() (the RLS bridge).
-- Seeds tenant #1 (the existing Glow org) deterministically by slug, seeds the
--   bootstrap platform_admin + owner membership, then installs the second-tenant
--   tripwire so onboarding tenant #2 is physically blocked until the Phase-2
--   app-code tenant-scoping fixes (PHASE1-MIGRATION-SPEC §11) have shipped.
--
-- This file is the additive, zero-risk first step. It adds NO tenant_id column,
-- re-keys NO existing PK, and changes NO existing policy: applying it leaves
-- prod a perfectly valid single-tenant DB with identical observable behavior.
-- The tenant_id backfills (0016/0017), index/PK re-keys (0018/0019), the RLS
-- rewrite (0020) and the created_by-default drop (0021) are separate files.
--
-- All statements here touch empty/new tables or the catalog, so there is no
-- lock concern. Idempotent throughout (create ... if not exists, guarded
-- create type, create or replace function, drop policy if exists before create,
-- on conflict do nothing on every seed).
--
-- Author only — DO NOT apply in this phase. Apply against a Supabase branch /
-- staging clone first, then prod via the dashboard SQL editor (no Supabase CLI,
-- per project memory).

set search_path = public;

create extension if not exists "pgcrypto";   -- gen_random_uuid(); already present from 0001, kept for standalone re-runs

----------------------------------------------------------------------
-- Enums
-- owner/admin/member is a small, stable set -> a true enum (unlike
-- plan/status below, which are text because billing/lifecycle states churn
-- and an enum would force ALTER TYPE ADD VALUE migrations later — the 0008
-- po_status lesson). CREATE TYPE has no IF NOT EXISTS, so guard it.
----------------------------------------------------------------------

do $$ begin
  create type public.org_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null;
end $$;

----------------------------------------------------------------------
-- PLATFORM: organizations
-- One row per tenant. The seeded Glow org is tenant #1; every backfill in
-- 0016/0017 anchors on (select id from organizations where slug = 'glow'),
-- never a literal UUID, so the migration set is environment-agnostic.
----------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  shop_domain text,                               -- e.g. 'glow.myshopify.com'; nullable (seed org may predate confirmed install), install-time idempotency key, UNIQUE
  slug        text not null,                      -- deterministic seed handle + backfill anchor; never a literal UUID
  name        text not null,
  plan        text not null default 'standard',   -- text, NOT enum: billing tiers churn -> avoid ALTER TYPE friction
  status      text not null default 'active',     -- active | suspended | cancelled
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- plain UNIQUE (not partial): PG allows multiple NULLs under a plain UNIQUE,
  -- so a not-yet-confirmed shop_domain is fine while a confirmed one stays unique.
  constraint organizations_shop_domain_key unique (shop_domain),
  constraint organizations_slug_key        unique (slug)
);

-- Reuse the shared 0001 helper so updated_at tracks every mutation.
drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

----------------------------------------------------------------------
-- PLATFORM: memberships
-- Internal-staff-only. Merchants resolve their org from the JWT org_id claim
-- (see current_org_ids()), NEVER a membership row. Near-empty in Phase 1; it
-- exists so the helper's union branch is real rather than vaporware.
----------------------------------------------------------------------

create table if not exists public.memberships (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id)           on delete cascade,
  role       public.org_role not null default 'member',
  created_at timestamptz not null default now(),
  -- one role per (org,user); doubles as the membership-resolution index and the
  -- natural idempotent upsert key.
  primary key (org_id, user_id)
);

-- current_org_ids() filters memberships by user_id -> give it an index scan.
create index if not exists memberships_user_id_idx
  on public.memberships (user_id);

----------------------------------------------------------------------
-- PLATFORM: platform_admins
-- Bare user_id allowlist gating the /admin back-office surface and the
-- cross-tenant read override (0020 Class 4). The FIRST row is a chicken-and-egg
-- bootstrap: it must be inserted by service-role/superuser, which is exactly
-- what this migration runs as (see seed below), before any is_platform_admin()
-- gated write policy could block it.
----------------------------------------------------------------------

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note       text
);

----------------------------------------------------------------------
-- Helper functions (the RLS bridge)
--
-- Both are SECURITY DEFINER + STABLE with a pinned search_path. SECURITY DEFINER
-- lets the functions read platform_admins/memberships regardless of the caller's
-- own (restrictive) RLS and avoids recursively triggering the very policies they
-- back. search_path is pinned to 'public, pg_temp' (pg_temp last) as the
-- Postgres-recommended hardening against search-path hijack for SECURITY DEFINER.
-- STABLE (not VOLATILE) is the key to RLS performance: the result is constant
-- within a statement, so wrapping a call in (SELECT ...) lets the planner
-- evaluate it ONCE per query (InitPlan) instead of once per row.
----------------------------------------------------------------------

create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- (a) merchant surface: org_id minted into the Supabase JWT at the
  -- Shopify-session bridge. auth.jwt() returns '{}'::jsonb for an
  -- unauthenticated/service-role request, so the guard yields an EMPTY SET
  -- (not a NULL row, not an error) -> policies that use `in (select ...)`
  -- deny everything. Fail-closed. The ::uuid cast is applied only to a
  -- surviving non-empty value; a *malformed* org_id is intentionally allowed
  -- to throw rather than be silently swallowed.
  select (auth.jwt() ->> 'org_id')::uuid
  where  nullif(auth.jwt() ->> 'org_id', '') is not null
  union
  -- (b) internal staff surface: every org the Supabase-authed user belongs to.
  -- union (not union all) dedupes the rare case where a staff user is also a
  -- member of the org named in a claim.
  select m.org_id
  from   public.memberships m
  where  m.user_id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_admins p
    where p.user_id = auth.uid()
  );
$$;

-- anon simply resolves to empty/false; granting EXECUTE on the function (not a
-- table grant) is what lets policies read memberships/platform_admins without
-- exposing those tables directly.
grant execute on function public.current_org_ids()  to authenticated, anon;
grant execute on function public.is_platform_admin() to authenticated, anon;

----------------------------------------------------------------------
-- RLS on the three new PLATFORM tables.
-- Defined AFTER the helpers so the policy bodies can reference them. Every
-- helper call is wrapped in (SELECT ...) for InitPlan caching (mandatory, not
-- stylistic). The install flow and all seeds run under service-role/superuser,
-- which bypasses RLS — these policies govern only authenticated app traffic.
----------------------------------------------------------------------

alter table public.organizations   enable row level security;
alter table public.memberships     enable row level security;
alter table public.platform_admins enable row level security;

-- organizations: a member reads its own org; platform admins read all;
-- writes are platform-admin only (the merchant install flow uses service-role,
-- which bypasses RLS entirely).
drop policy if exists "org read self"  on public.organizations;
drop policy if exists "org admin write" on public.organizations;

create policy "org read self" on public.organizations
  for select to authenticated
  using ( id in (select public.current_org_ids()) or (select public.is_platform_admin()) );

create policy "org admin write" on public.organizations
  for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );

-- memberships: a user reads its own rows; platform admins read/write all.
drop policy if exists "membership read self"   on public.memberships;
drop policy if exists "membership admin write" on public.memberships;

create policy "membership read self" on public.memberships
  for select to authenticated
  using ( user_id = (select auth.uid()) or (select public.is_platform_admin()) );

create policy "membership admin write" on public.memberships
  for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );

-- platform_admins: admins read/write the allowlist; nobody else sees it.
-- BOOTSTRAP NOTE: the FIRST admin row is seeded below under service-role
-- (chicken-and-egg) — it cannot be created through this policy.
drop policy if exists "platform_admins admin all" on public.platform_admins;

create policy "platform_admins admin all" on public.platform_admins
  for all to authenticated
  using      ( (select public.is_platform_admin()) )
  with check ( (select public.is_platform_admin()) );

----------------------------------------------------------------------
-- Seed tenant #1 (the existing Glow business).
-- Idempotent: on conflict (slug) do nothing -> re-running is a no-op, and the
-- slug UNIQUE guarantees exactly one Glow org. Every 0016/0017 backfill reads
-- (select id from organizations where slug = 'glow').
-- NOTE: shop_domain below is a best guess; confirm the real .myshopify.com
-- before applying. It may be seeded NULL and set at install time without
-- affecting the slug-anchored backfills.
----------------------------------------------------------------------

insert into public.organizations (shop_domain, slug, name, plan, status)
values ('glow.myshopify.com', 'glow', 'Glow', 'standard', 'active')
on conflict (slug) do nothing;

-- Seed staff access so the existing internal user(s) keep access through the
-- new policies. The platform_admins insert is the bootstrap (chicken-and-egg);
-- it runs under the migration's service-role/superuser session, before any
-- is_platform_admin()-gated write policy could block it. Add the second staff
-- email to both IN-lists before applying if there is one.
insert into public.platform_admins (user_id)
select id from auth.users
where  email in ('paul@corso.com' /*, 'second-staff@example.com' */)
on conflict (user_id) do nothing;

insert into public.memberships (org_id, user_id, role)
select (select id from public.organizations where slug = 'glow'), u.id, 'owner'
from   auth.users u
where  u.email in ('paul@corso.com' /*, 'second-staff@example.com' */)
on conflict (org_id, user_id) do nothing;

----------------------------------------------------------------------
-- Second-tenant tripwire (the spec §0 layer-2 control).
-- A BEFORE INSERT trigger that REFUSES to create a second organization unless
-- the session GUC app.allow_second_tenant is explicitly set to 'on'. This makes
-- "onboard tenant #2 before the cross-tenant delete/update fixes ship" a hard
-- error rather than merely discouraged. With exactly one tenant, every unscoped
-- service-role delete/update in the app is harmless — this trigger keeps it that
-- way until PHASE1-MIGRATION-SPEC §11 lands.
--
-- ORDERING: created AFTER the seed insert above so the first (Glow) row is
-- never blocked. RE-RUNNABILITY: a BEFORE INSERT trigger fires before ON
-- CONFLICT is resolved, so a re-run of the seed would re-enter this function
-- with the same 'glow' slug. The guard therefore only trips for a row whose
-- slug does NOT already exist (a genuinely new org); a re-inserted existing
-- slug passes the trigger and is then absorbed by ON CONFLICT DO NOTHING.
----------------------------------------------------------------------

create or replace function public.guard_second_tenant()
returns trigger
language plpgsql
as $$
begin
  -- Allow re-inserting an already-present org (idempotent seed / on-conflict
  -- no-op); only a brand-new slug counts as "onboarding another tenant".
  if exists (select 1 from public.organizations o where o.slug = new.slug) then
    return new;
  end if;

  -- A new org is being created. Block it unless there is no org yet (first
  -- tenant) or the operator has explicitly opted in for this session.
  if (select count(*) from public.organizations) >= 1
     and coalesce(current_setting('app.allow_second_tenant', true), 'off') <> 'on' then
    raise exception
      'Refusing to create a second organization: Phase-2 tenant-scoping not confirmed. '
      'Set app.allow_second_tenant=on in this session ONLY after the cross-tenant '
      'delete/update fixes (PHASE1-MIGRATION-SPEC §11) have shipped.';
  end if;
  return new;
end $$;

drop trigger if exists organizations_guard_second_tenant on public.organizations;
create trigger organizations_guard_second_tenant
  before insert on public.organizations
  for each row execute function public.guard_second_tenant();
