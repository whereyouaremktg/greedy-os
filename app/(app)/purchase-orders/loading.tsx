import { Skeleton } from "@/components/ui/skeleton";

export default function PurchaseOrdersLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
