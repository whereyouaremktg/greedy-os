import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function KpiTile({
  title,
  value,
  hint,
  status = "pending",
}: {
  title: string;
  value: string;
  hint?: string;
  status?: "pending" | "live" | "stale";
}) {
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
            status === "pending" && "text-muted-foreground",
            status === "stale" && "border-amber-500 text-amber-600",
            status === "live" && "border-emerald-500 text-emerald-600",
          )}
        >
          {status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? (
          <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
