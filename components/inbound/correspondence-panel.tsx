"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import {
  applyEmailUpdates,
  getCorrespondence,
  type CorrespondenceData,
} from "@/lib/actions/inbound";
import type { MatchedEntityType } from "@/lib/inbound/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function prettyDate(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * Email thread + latest agent read for a manufacturing run or wholesale PO.
 * Rendered inside the existing detail sheets; loads on mount via server
 * action so the board pages don't preload every thread.
 */
export function CorrespondencePanel({
  entityType,
  entityId,
}: {
  entityType: MatchedEntityType;
  entityId: string;
}) {
  const [data, setData] = React.useState<CorrespondenceData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applying, startApply] = React.useTransition();

  const load = React.useCallback(() => {
    return getCorrespondence(entityType, entityId).then((result) => {
      if (result.ok) setData(result.data);
      setLoading(false);
    });
  }, [entityType, entityId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading correspondence…
      </div>
    );
  }
  if (!data || data.messages.length === 0) {
    return (
      <div className="py-3 text-sm text-muted-foreground">
        No emails linked to this order yet.
      </div>
    );
  }

  const { latest } = data;

  function handleApply() {
    if (!latest) return;
    startApply(async () => {
      const result = await applyEmailUpdates(latest.messageId);
      if (result.ok) {
        toast.success(
          result.data.applied.length > 0
            ? `Applied: ${result.data.applied.join("; ")}`
            : "Nothing new to apply",
        );
        void load();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      {latest ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p>{latest.summary}</p>
          {latest.missing.length > 0 ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Missing:</span>{" "}
              {latest.missing.join(" · ")}
            </p>
          ) : null}
          {latest.openQuestions.length > 0 ? (
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Open questions:</span>{" "}
              {latest.openQuestions.join(" · ")}
            </p>
          ) : null}
          {latest.needsReview.length > 0 ? (
            <p className="text-destructive">
              <span className="font-medium">Needs review:</span>{" "}
              {latest.needsReview.join(" · ")}
            </p>
          ) : null}
          {latest.suggested.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">
                Suggested: {latest.suggested.join(" · ")}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? <Loader2 className="size-3 animate-spin" /> : null}
                Apply
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Separator />

      <ul className="space-y-2">
        {data.messages.map((m) => (
          <li key={m.id} className="flex items-start gap-2 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.subject ?? "(no subject)"}</span>
                <span className="text-xs text-muted-foreground">
                  {m.from_email} · {prettyDate(m.received_at)}
                </span>
                {m.status === "needs_review" ? (
                  <Badge variant="destructive">needs review</Badge>
                ) : null}
              </div>
              {m.snippet ? (
                <p className="truncate text-xs text-muted-foreground">{m.snippet}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
