import { Skeleton } from "@/components/ui/skeleton";

export default function ManufacturingLoading() {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-14" />
        </div>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="min-w-[220px] flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <div className="space-y-2 rounded-lg border border-dashed p-2">
              {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, row) => (
                <Skeleton key={row} className="h-[88px] w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
