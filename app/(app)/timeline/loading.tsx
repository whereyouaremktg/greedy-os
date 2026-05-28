import { Skeleton } from "@/components/ui/skeleton";

export default function TimelineLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <Skeleton className="h-[400px] w-full rounded-lg" />
    </div>
  );
}
