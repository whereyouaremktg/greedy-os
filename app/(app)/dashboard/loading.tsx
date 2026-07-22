import { Skeleton } from "@/components/ui/skeleton";

function PulseSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-3 w-36" />
    </div>
  );
}

function KpiTileSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-1.5 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-32" />
      <Skeleton className="mt-3 h-16 w-full rounded-sm" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PulseSkeleton />
        <PulseSkeleton />
        <PulseSkeleton />
        <PulseSkeleton />
      </div>

      <Skeleton className="h-[92px] rounded-lg" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <Skeleton className="h-[390px] rounded-xl" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </div>
        <div className="space-y-5">
          <Skeleton className="h-[300px] rounded-xl" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
