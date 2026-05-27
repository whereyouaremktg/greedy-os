import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-9 w-52" />
      <div className="flex gap-3">
        <Skeleton className="h-72 flex-1 rounded-lg" />
        <Skeleton className="h-72 flex-1 rounded-lg" />
        <Skeleton className="h-72 flex-1 rounded-lg" />
      </div>
    </div>
  );
}
