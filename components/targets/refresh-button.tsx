"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshTargets } from "@/lib/actions/targets";
import { cn } from "@/lib/utils";

export function RefreshButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const res = await refreshTargets();
          if (res.ok) {
            const d = res.data;
            const parts = [`${d?.ordersUpserted ?? 0} orders`, `${d?.shipmentsUpserted ?? 0} shipments`];
            if (d?.partialFailure) {
              toast.warning(`Synced ${parts.join(" and ")}, but part of the refresh failed`, {
                description: d.partialFailure,
              });
            } else {
              toast.success(
                d?.complete
                  ? `Synced ${parts.join(" and ")}`
                  : `Synced ${parts.join(" and ")} so far; more on the next run`,
              );
            }
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      <RefreshCw className={cn(pending && "animate-spin")} />
      {pending ? "Syncing…" : "Refresh"}
    </Button>
  );
}
