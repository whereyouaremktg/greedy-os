"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isConnectorId,
  isKnownConnectorKey,
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

  await requireAuthedUser();

  const entries = Object.entries(payload).filter(([key]) =>
    isKnownConnectorKey(connectorId, key),
  );
  const upserts: { connector: ConnectorId; key: string; value: string }[] = [];
  const deletes: string[] = [];
  for (const [key, raw] of entries) {
    const value = raw.trim();
    if (value.length > 0) upserts.push({ connector: connectorId, key, value });
    else deletes.push(key);
  }

  const service = createServiceClient();

  if (upserts.length > 0) {
    const { error } = await service
      .from("connector_credentials")
      .upsert(upserts, { onConflict: "connector,key" });
    if (error) {
      return { ok: false, error: `Save failed: ${error.message}` };
    }
  }

  if (deletes.length > 0) {
    const { error } = await service
      .from("connector_credentials")
      .delete()
      .eq("connector", connectorId)
      .in("key", deletes);
    if (error) {
      return { ok: false, error: `Clear failed: ${error.message}` };
    }
  }

  revalidatePath("/settings");
  return { ok: true };
}

// Disconnect: remove every stored row for this connector. Vercel env vars
// (if set) keep providing values — the UI will then show "Env" instead of
// "Saved".
export async function clearConnector(connector: string): Promise<ActionResult> {
  if (!isConnectorId(connector)) {
    return { ok: false, error: `Unknown connector: ${connector}` };
  }
  const connectorId: ConnectorId = connector;

  await requireAuthedUser();

  const service = createServiceClient();
  const { error } = await service
    .from("connector_credentials")
    .delete()
    .eq("connector", connectorId);
  if (error) {
    return { ok: false, error: `Disconnect failed: ${error.message}` };
  }

  revalidatePath("/settings");
  return { ok: true };
}
