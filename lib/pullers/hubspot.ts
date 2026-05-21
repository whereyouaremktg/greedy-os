import { createServiceClient } from "@/lib/supabase/service";
import { seedInt, seedNumber } from "./_mock";

const STAGES = [
  "prospecting",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

const ACCOUNTS = [
  { company: "Alpine Apothecary", state: "UT", owner: "Marissa" },
  { company: "Wasatch Skin Co.", state: "UT", owner: "Marissa" },
  { company: "Park City Boutique", state: "UT", owner: "Paul" },
  { company: "SLC Wellness Market", state: "UT", owner: "Marissa" },
  { company: "Provo Beauty Hub", state: "UT", owner: "Paul" },
  { company: "Boulder Spa Collective", state: "CO", owner: "Marissa" },
  { company: "Denver Co-op Beauty", state: "CO", owner: "Paul" },
  { company: "Aspen Skin Lounge", state: "CO", owner: "Marissa" },
  { company: "Phoenix Glow Bar", state: "AZ", owner: "Paul" },
  { company: "Sedona Spa Group", state: "AZ", owner: "Marissa" },
  { company: "Vegas Strip Beauty", state: "NV", owner: "Paul" },
  { company: "Reno Wellness Market", state: "NV", owner: "Marissa" },
  { company: "Pasadena Apothecary", state: "CA", owner: "Paul" },
  { company: "Venice Skin House", state: "CA", owner: "Marissa" },
  { company: "Oakland Co-op Skin", state: "CA", owner: "Paul" },
  { company: "Portland Skin Lab", state: "OR", owner: "Marissa" },
  { company: "Bend Beauty Outpost", state: "OR", owner: "Paul" },
  { company: "Seattle Glow Studio", state: "WA", owner: "Marissa" },
  { company: "Bozeman Botanicals", state: "MT", owner: "Paul" },
  { company: "Jackson Hole Spa", state: "WY", owner: "Marissa" },
];

// STUB: deterministic mock HubSpot wholesale pipeline (20 deals).
// Replace with real HubSpot Deals API (`/crm/v3/objects/deals`) when wired.
export async function runHubspotPull() {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const today = new Date();

  const rows = ACCOUNTS.map((acct, i) => {
    const id = `deal_${String(i + 1).padStart(3, "0")}`;
    const k = (suffix: string) => `hubspot:${id}:${suffix}`;
    const stage = STAGES[seedInt(k("stage"), 0, STAGES.length - 1)];
    const amount = seedNumber(k("amt"), 4000, 75000);
    const closeOffset = seedInt(k("close"), -45, 90);
    const close = new Date(today);
    close.setUTCDate(close.getUTCDate() + closeOffset);

    return {
      id,
      deal_name: `${acct.company} — Q${seedInt(k("q"), 1, 4)} order`,
      company: acct.company,
      stage,
      amount,
      state: acct.state,
      owner: acct.owner,
      close_date: close.toISOString().slice(0, 10),
      synced_at: now,
    };
  });

  const { error } = await supabase
    .from("hubspot_deals")
    .upsert(rows, { onConflict: "id" });

  if (error) throw new Error(`hubspot_deals upsert: ${error.message}`);
  return { ok: true, rows: rows.length };
}
