import { Skeleton } from "@/components/ui/skeleton";

function KpiTileSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10 space-y-3">
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

function SectionHeaderSkeleton() {
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 pb-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export default function DashboardLoading() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <Skeleton className="h-[360px] rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiTileSkeleton />
            <KpiTileSkeleton />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeaderSkeleton />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </section>
      </div>
      <Skeleton className="min-h-[480px] rounded-xl" />
    </div>
  );
}
