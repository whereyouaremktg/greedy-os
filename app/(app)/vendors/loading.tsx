import { Skeleton } from "@/components/ui/skeleton";

export default function VendorsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="rounded-md border">
        <div className="border-b px-4 py-3">
          <div className="flex gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-8 ml-auto" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
