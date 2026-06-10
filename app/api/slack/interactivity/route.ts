import { addDays, formatISO } from "date-fns";
import { waitUntil } from "@vercel/functions";
import {
  IdentityNotLinkedError,
  resolveGlowUser,
} from "@/lib/slack/identity";
import {
  identityNotLinkedBlocks,
  identityNotLinkedText,
  paymentDueBlocks,
} from "@/lib/slack/messages";
import { verifySlackSignature } from "@/lib/slack/verify";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type SlackAction = {
  action_id: string;
  value?: string;
};

type SlackInteractivityPayload = {
  type: string;
  user: { id: string };
  response_url: string;
  message?: { blocks?: unknown[] };
  actions?: SlackAction[];
};

async function loadPaymentForBlocks(paymentId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("po_payments")
    .select(
      `
      id,
      label,
      amount,
      due_date,
      paid,
      purchase_orders!inner (
        id,
        vendors!inner ( name )
      )
    `,
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !data) return null;

  const po = data.purchase_orders as {
    id: string;
    vendors: { name: string };
  };

  return {
    id: data.id,
    label: data.label,
    amount: Number(data.amount),
    due_date: data.due_date,
    vendorName: po.vendors.name,
    poId: po.id,
    paid: data.paid,
  };
}

async function respondOnResponseUrl(
  responseUrl: string,
  body: Record<string, unknown>,
) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get("payload");
  if (!payloadRaw) {
    return new Response("Missing payload", { status: 400 });
  }

  const payload = JSON.parse(payloadRaw) as SlackInteractivityPayload;
  if (payload.type !== "block_actions" || !payload.actions?.length) {
    return new Response("ok");
  }

  const action = payload.actions[0];
  const paymentId = action.value;
  if (!paymentId) {
    return new Response("ok");
  }

  // Ack within Slack's 3s window; the DB work + response_url update run after.
  waitUntil(
    handleBlockAction(payload, action, paymentId).catch((err) =>
      console.error("[slack/interactivity] action error", err),
    ),
  );
  return new Response("ok");
}

async function handleBlockAction(
  payload: SlackInteractivityPayload,
  action: SlackAction,
  paymentId: string,
) {
  try {
    await resolveGlowUser(payload.user.id);
  } catch (err) {
    if (err instanceof IdentityNotLinkedError) {
      await respondOnResponseUrl(payload.response_url, {
        replace_original: true,
        response_type: "ephemeral",
        text: identityNotLinkedText(err.slackUserId, err.slackEmail),
        blocks: identityNotLinkedBlocks(err.slackUserId, err.slackEmail),
      });
      return;
    }
    throw err;
  }

  const supabase = createServiceClient();

  if (action.action_id === "mark-payment-paid") {
    const today = formatISO(new Date(), { representation: "date" });
    const { error } = await supabase
      .from("po_payments")
      .update({ paid: true, paid_date: today })
      .eq("id", paymentId)
      .eq("paid", false);

    const row = await loadPaymentForBlocks(paymentId);
    if (row) {
      await respondOnResponseUrl(payload.response_url, {
        replace_original: true,
        blocks: paymentDueBlocks(row, { paid: true }),
        text: `PO payment marked paid — ${row.vendorName}`,
      });
    }

    if (error) {
      console.error("[slack/interactivity] mark paid error", error);
    }

    return;
  }

  if (action.action_id === "snooze-payment") {
    const { data: current } = await supabase
      .from("po_payments")
      .select("due_date")
      .eq("id", paymentId)
      .maybeSingle();

    const base = current?.due_date
      ? new Date(`${current.due_date}T00:00:00Z`)
      : new Date();
    const nextDue = formatISO(addDays(base, 3), { representation: "date" });

    const { error } = await supabase
      .from("po_payments")
      .update({ due_date: nextDue })
      .eq("id", paymentId);

    const row = await loadPaymentForBlocks(paymentId);
    if (row) {
      row.due_date = nextDue;
      await respondOnResponseUrl(payload.response_url, {
        replace_original: true,
        blocks: paymentDueBlocks(row, { snoozed: true }),
        text: `PO payment snoozed — ${row.vendorName}`,
      });
    }

    if (error) {
      console.error("[slack/interactivity] snooze error", error);
    }

    return;
  }
}
