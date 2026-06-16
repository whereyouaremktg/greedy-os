import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Minimal read surface so we don't fight Supabase's deep generics.
type OrgQueryDb = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
      limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

// Resolve the tenant_id that a service-role puller must stamp on every mirrored
// row it writes.
//
// Background: tenant_id columns default to the JWT `org_id` claim
// (migration 0016). The service-role client carries NO JWT, so that default
// resolves to NULL and an insert would violate the NOT NULL / composite PK
// (migration 0017 deliberately makes a tenant-less upsert error rather than
// silently clobber another tenant's row). Pullers therefore have to look up and
// set tenant_id explicitly.
//
// v1 is single-tenant: the seeded `glow` org. We resolve by slug, with a
// sole-org fallback so this keeps working if the slug ever changes.

const DEFAULT_ORG_SLUG = "glow";

let cached: string | null = null;

function errMsg(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export async function resolveDefaultTenantId(): Promise<string> {
  if (cached) return cached;
  const db = createServiceClient() as unknown as OrgQueryDb;

  const bySlug = await db
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_ORG_SLUG)
    .maybeSingle();
  if (bySlug.error) {
    throw new Error(`resolveDefaultTenantId (slug): ${errMsg(bySlug.error)}`);
  }
  const slugId = (bySlug.data as { id: string } | null)?.id;
  if (slugId) {
    cached = slugId;
    return slugId;
  }

  // Fallback: if there's exactly one org, use it.
  const all = await db.from("organizations").select("id").limit(2);
  if (all.error) {
    throw new Error(`resolveDefaultTenantId (list): ${errMsg(all.error)}`);
  }
  const rows = (all.data as { id: string }[] | null) ?? [];
  if (rows.length === 1) {
    cached = rows[0].id;
    return cached;
  }

  throw new Error(
    `resolveDefaultTenantId: no org with slug '${DEFAULT_ORG_SLUG}' and ${rows.length} orgs exist — cannot pick a default tenant.`,
  );
}
