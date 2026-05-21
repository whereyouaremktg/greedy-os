/**
 * One-off: create invite-only auth users via service role.
 * Usage: node scripts/bootstrap-auth-users.mjs
 * Reads .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
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
  { email: "paul@glowbeautyhair.com", name: "Paul" },
  { email: "marissa@glowbeautyhair.com", name: "Marissa" },
  { email: "adam@glowbeautyhair.com", name: "Adam" },
];

for (const { email, name } of users) {
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = existing?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (found) {
    console.log(`skip (exists): ${email}`);
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
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
  else console.log(`  send password reset from Supabase dashboard for ${email}`);
}

console.log("Done. Disable public sign-ups in Auth → Providers if not already.");
