import { Skeleton } from "@/components/ui/skeleton";

function Tile() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-28" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}

export default function TargetsLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-[260px] rounded-xl" />
      <Skeleton className="h-7 w-96 max-w-full rounded-full" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile />
        <Tile />
        <Tile />
        <Tile />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}
