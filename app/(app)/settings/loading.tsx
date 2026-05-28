import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
      </div>

      <Skeleton className="h-32 w-full rounded-xl" />

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
