import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatStaleness,
  tileStatus,
  type TileStatus,
} from "@/lib/dashboard/staleness";

type Props = {
  title: string;
  value: string;
  hint?: string;
  sub?: string;
  // Owned tiles pass `syncedAt = null` and stay "live" with no badge color.
  // Mirrored tiles pass an ISO timestamp + their stale threshold and let the
  // helper decide live vs stale. Caller can still force `status` for pending.
  syncedAt?: string | null;
  staleAfterMs?: number | null;
  status?: TileStatus;
};

export function KpiTile({
  title,
  value,
  hint,
  sub,
  syncedAt = null,
  staleAfterMs = null,
  status,
}: Props) {
  const computed: TileStatus = status ?? tileStatus(syncedAt, staleAfterMs);
  const syncLabel =
    computed === "pending" ? null : formatStaleness(syncedAt, staleAfterMs);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase",
            computed === "pending" && "text-muted-foreground",
            computed === "stale" && "border-amber-500 text-amber-600",
            computed === "live" && "border-emerald-500 text-emerald-600",
          )}
        >
          {computed}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub ? (
          <p className="text-xs text-foreground/70 mt-1">{sub}</p>
        ) : null}
        {hint ? (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        ) : null}
        {syncLabel ? (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2">
            {syncLabel}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
