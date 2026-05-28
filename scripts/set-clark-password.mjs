/**
 * One-off: ensure clark@potentstudio.com exists and set password to a known value.
 * Run: node scripts/set-clark-password.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      const key = line.slice(0, i);
      let val = line.slice(i + 1);
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      return [key, val];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "clark@potentstudio.com";
const password = "123456";
const name = "Clark";

const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}

const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

if (found) {
  console.log(`exists: ${email} (${found.id}) — updating password`);
  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`update failed:`, error.message);
    process.exit(1);
  }
  console.log(`password updated for ${email}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    console.error(`create failed:`, error.message);
    process.exit(1);
  }
  console.log(`created: ${email} (${data.user?.id})`);
}

console.log("Done.");
