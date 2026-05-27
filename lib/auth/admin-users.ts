import "server-only";

import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/db";

const LIST_USERS_PER_PAGE = 200;

export async function listAllAuthUsers(
  supabase: SupabaseClient<Database>,
): Promise<User[]> {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PER_PAGE,
    });

    if (error) {
      throw new Error(`listAllAuthUsers: ${error.message}`);
    }

    users.push(...data.users);
    if (data.users.length < LIST_USERS_PER_PAGE) break;
    page += 1;
  }

  return users;
}

export function findUserByEmail(users: User[], email: string): User | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return (
    users.find((u) => u.email?.trim().toLowerCase() === normalized) ?? null
  );
}

export { LIST_USERS_PER_PAGE };
