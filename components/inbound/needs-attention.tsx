import { format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { InboundStream } from "@/lib/inbound/types";

/**
 * Inbound emails the agent couldn't confidently link or apply — the human
 * queue for a stream. Server-rendered above the board; renders nothing when
 * the queue is empty.
 */
export async function NeedsAttention({ stream }: { stream: InboundStream }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inbound_messages")
    .select("id, from_email, subject, error, received_at")
    .eq("stream", stream)
    .eq("status", "needs_review")
    .order("received_at", { ascending: false })
    .limit(8);

  if (!data?.length) return null;

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-amber-600" />
        Needs attention — {data.length} email{data.length === 1 ? "" : "s"} to review
      </div>
      <ul className="space-y-1 text-sm">
        {data.map((m) => (
          <li key={m.id} className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {m.subject ?? "(no subject)"}
            </span>{" "}
            — {m.from_email ?? "unknown sender"} ·{" "}
            {format(parseISO(m.received_at), "MMM d")}
            {m.error ? ` · ${m.error}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
