"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isConnectorId,
  isKnownConnectorKey,
  setCredentials,
  deleteCredentials,
  QUICKBOOKS_OAUTH_RUNTIME_KEYS,
  type ConnectorId,
} from "@/lib/connectors/credentials";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

// Save the values for one connector. Non-empty fields are upserted; empty
// fields delete the existing row so the user can clear a value individually.
// Values never echo back to the client — the page revalidates and re-reads
// status only.
export async function saveConnectorCredentials(
  connector: string,
  payload: Record<string, string>,
): Promise<ActionResult> {
  if (!isConnectorId(connector)) {
    return { ok: false, error: `Unknown connector: ${connector}` };
  }
  const connectorId: ConnectorId = connector;

  const user = await requireAuthedUser();

  const upserts: Record<string, string> = {};
  const deletes: string[] = [];
  for (const [key, raw] of Object.entries(payload)) {
    if (!isKnownConnectorKey(connectorId, key)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > 0) upserts[key] = value;
    else deletes.push(key);
  }

  try {
    if (Object.keys(upserts).length > 0) {
      await setCredentials(connectorId, upserts, user.id);
    }
    if (deletes.length > 0) {
      await deleteCredentials(connectorId, deletes);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

// Disconnect: remove every stored row for this connector. Vercel env vars
// (if set, for non-QuickBooks connectors) keep providing values — the UI
// will then show "Env" instead of "Saved".
export async function clearConnector(connector: string): Promise<ActionResult> {
  if (!isConnectorId(connector)) {
    return { ok: false, error: `Unknown connector: ${connector}` };
  }
  await requireAuthedUser();

  try {
    await deleteCredentials(connector);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings");
  return { ok: true };
}

// QuickBooks-specific disconnect: wipes only the OAuth-runtime rows so the
// user can reconnect without re-pasting client_id / client_secret / env.
export async function disconnectQuickbooks(): Promise<ActionResult> {
  await requireAuthedUser();

  try {
    await deleteCredentials("quickbooks", [...QUICKBOOKS_OAUTH_RUNTIME_KEYS]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
