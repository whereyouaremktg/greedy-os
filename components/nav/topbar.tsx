"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/components/command/command-palette";
import { formatRelativeTime } from "@/lib/format";
import type { GlobalSyncStatus } from "@/lib/dashboard/sync-status";

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vendors": "Vendors",
  "/purchase-orders": "Purchase Orders",
  "/manufacturing": "Manufacturing",
  "/campaigns": "Campaigns",
};

function breadcrumbLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const base = `/${pathname.split("/")[1] ?? ""}`;
  return ROUTE_LABELS[base] ?? "Glow OS";
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "?";
}

function syncPillLabel(syncStatus: GlobalSyncStatus): string {
  if (!syncStatus.latestSyncedAt) return "Awaiting sync";
  const rel = formatRelativeTime(
    Date.now() - Date.parse(syncStatus.latestSyncedAt),
  );
  return `Last sync: ${rel}`;
}

export function Topbar({
  email,
  syncStatus,
}: {
  email: string;
  syncStatus: GlobalSyncStatus;
}) {
  const pathname = usePathname();
  const { setOpen } = useCommandPalette();

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b bg-background/80 px-5 backdrop-blur-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">
          {breadcrumbLabel(pathname)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground",
            syncStatus.isStale && "border-warning/40 text-warning",
          )}
        >
          {syncPillLabel(syncStatus)}
        </span>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-muted-foreground font-normal"
          onClick={() => setOpen(true)}
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline text-xs">Search</span>
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Button>

        <Avatar size="sm" className="size-7">
          <AvatarFallback className="text-[10px] font-medium bg-brand/10 text-brand">
            {initialsFromEmail(email)}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
