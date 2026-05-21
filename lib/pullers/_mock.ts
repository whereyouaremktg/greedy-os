// Deterministic mock data utilities for stub pullers.
// Values are stable across runs for the same seed, so cron upserts are
// idempotent. They vary across (connector, date) so charts have shape.

function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seedNumber(seed: string, min: number, max: number, decimals = 2): number {
  const h = fnv1a(seed);
  const ratio = (h & 0xffff) / 0xffff;
  const value = min + ratio * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function seedInt(seed: string, min: number, max: number): number {
  const h = fnv1a(seed);
  const ratio = (h & 0xffff) / 0xffff;
  return Math.floor(min + ratio * (max - min + 1));
}

export function lastNDates(n: number): string[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}
