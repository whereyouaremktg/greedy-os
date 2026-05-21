import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignsLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
