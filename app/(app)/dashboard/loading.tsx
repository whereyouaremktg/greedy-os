import { Skeleton } from "@/components/ui/skeleton";

function KpiTileSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-1.5 rounded-full" />
      </div>
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-16 w-full rounded-sm" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Skeleton className="h-4 w-80 max-w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <KpiTileSkeleton key={i} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
      <Skeleton className="min-h-[480px] rounded-lg" />
    </div>
  );
}
