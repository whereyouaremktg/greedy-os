/**
 * One-off: create requested auth users via service role.
 * Run: node scripts/create-requested-users.mjs
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

const users = [
  { email: "adam@glowbeautyhair.com", name: "Adam" },
  { email: "marissa@glowbeautyhair.com", name: "Marissa" },
  { email: "clark@potentstudio.com", name: "Clark" },
];

const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("listUsers failed:", listErr.message);
  process.exit(1);
}

for (const { email, name } of users) {
  const found = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    console.log(`exists: ${email} (${found.id})`);
    const { error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (linkErr) console.error(`  recovery link failed: ${linkErr.message}`);
    else console.log(`  recovery link generated for ${name}`);
    continue;
  }

  const tempPassword = crypto.randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    console.error(`create failed ${email}:`, error.message);
    continue;
  }
  console.log(`created: ${email} (${data.user?.id})`);

  const { error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkErr) console.error(`  recovery link failed: ${linkErr.message}`);
  else console.log(`  recovery link generated for ${name}`);
}

console.log("Done.");
