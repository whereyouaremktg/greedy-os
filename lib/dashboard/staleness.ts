// Cache-tile staleness helpers.
//
// Each MIRRORED tile passes `syncedAt` (ISO) + `staleAfterMs`. If the data is
// older than that threshold we flip the tile badge to "stale". OWNED tiles
// pass `syncedAt = null` and render as "live" (no badge color).

export type TileStatus = "pending" | "live" | "stale";

export const STALE_AFTER = {
  qb: 12 * 60 * 60 * 1000, // 2× 6h cron
  shopify: 4 * 60 * 60 * 1000, // 2× 2h cron
  klaviyo: 8 * 60 * 60 * 1000, // 2× 4h cron
  hubspot: 12 * 60 * 60 * 1000, // 2× 6h cron
} as const;

export function tileStatus(
  syncedAt: string | null,
  staleAfterMs: number | null,
): TileStatus {
  if (!syncedAt || staleAfterMs == null) return "live";
  const synced = Date.parse(syncedAt);
  if (Number.isNaN(synced)) return "pending";
  return Date.now() - synced > staleAfterMs ? "stale" : "live";
}

export function formatStaleness(
  syncedAt: string | null,
  staleAfterMs: number | null,
): string | null {
  if (!syncedAt) return null;
  const synced = Date.parse(syncedAt);
  if (Number.isNaN(synced)) return null;
  const deltaMs = Date.now() - synced;
  const stale = staleAfterMs != null && deltaMs > staleAfterMs;
  const rel = relative(deltaMs);
  return stale ? `Stale — synced ${rel}` : `Synced ${rel}`;
}

function relative(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
