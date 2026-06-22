#!/usr/bin/env node
// Upsert one QuickBooks snapshot row into qb_financials.
//
// Source of the numbers is the QuickBooks "cloud connector" (MCP) — the daily
// scheduled Claude routine calls the connector's report tools, extracts the
// summary figures, and pipes them here as JSON on stdin. Keeping the upsert in
// a committed script (rather than inline in the routine prompt) means the
// column mapping is version-controlled and identical every run.
//
// Usage:
//   echo '{"as_of_date":"2026-06-22","cash_position":431885.73, ...}' \
//     | node scripts/qb-connector-sync.mjs
//
// Required: as_of_date (YYYY-MM-DD), cash_position.
// Optional: ar_total, ar_aging_current, ar_aging_30, ar_aging_60, ar_aging_90,
//           ar_aging_over_90, ap_total, ap_due_30, revenue, cogs, expenses,
//           net_income. Omitted keys are left unset (NULL on insert).
//
// Matches the column shape the dashboard reads via lib/dashboard/metrics.ts
// (getCashSnapshot / getArAging). Idempotent: upsert on as_of_date.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ALLOWED = new Set([
  "as_of_date",
  "cash_position",
  "ar_total",
  "ar_aging_current",
  "ar_aging_30",
  "ar_aging_60",
  "ar_aging_90",
  "ar_aging_over_90",
  "ap_total",
  "ap_due_30",
  "revenue",
  "cogs",
  "expenses",
  "net_income",
]);

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // fall through to process.env
  }
  return { ...env, ...process.env };
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const raw = process.argv[2] || readStdin();
  if (!raw.trim()) {
    console.error("No JSON provided on argv[2] or stdin.");
    process.exit(1);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    console.error("Invalid JSON:", e.message);
    process.exit(1);
  }

  if (!input.as_of_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.as_of_date)) {
    console.error("as_of_date (YYYY-MM-DD) is required.");
    process.exit(1);
  }
  if (typeof input.cash_position !== "number") {
    console.error("cash_position (number) is required.");
    process.exit(1);
  }

  const row = { synced_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (ALLOWED.has(k) && v !== undefined && v !== null) row[k] = v;
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb
    .from("qb_financials")
    .upsert(row, { onConflict: "as_of_date" });
  if (error) {
    console.error("Upsert failed:", error.message);
    process.exit(1);
  }

  console.log(
    `qb_financials upserted ${row.as_of_date}: cash=${row.cash_position}, ar_total=${row.ar_total ?? "—"}, ap_total=${row.ap_total ?? "—"}`,
  );
}

main();
