"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Factory,
  Megaphone,
  Building2,
  Package,
  Boxes,
  LogOut,
  Settings,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  GlobalSyncStatus,
  NavCounter,
  NavCounters,
} from "@/lib/dashboard/sync-status";

type NavCounterKey = keyof NavCounters;

const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  counter?: NavCounterKey;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    icon: FileText,
    counter: "purchaseOrders",
  },
  {
    href: "/manufacturing",
    label: "Manufacturing",
    icon: Factory,
    counter: "manufacturing",
  },
  {
    href: "/timeline",
    label: "Timeline",
    icon: CalendarRange,
    counter: "timeline",
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: Megaphone,
    counter: "campaigns",
  },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/products", label: "Products", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavCounterPill({ counter }: { counter: NavCounter }) {
  if (!counter || counter.count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium num",
        counter.tone === "warning"
          ? "bg-warning/15 text-warning"
          : "bg-muted text-muted-foreground",
      )}
      aria-label={`${counter.count} ${counter.tone === "warning" ? "needs attention" : "open"}`}
    >
      {counter.count}
    </span>
  );
}

export function Sidebar({
  email,
  syncStatus,
  navCounters,
}: {
  email: string;
  syncStatus: GlobalSyncStatus;
  navCounters: NavCounters;
}) {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 border-r bg-sidebar flex flex-col">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
          Glow OS
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Command center
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon, counter }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          const counterValue = counter ? navCounters[counter] : null;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              suppressHydrationWarning
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
              <NavCounterPill counter={counterValue} />
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span
            className={cn(
              "size-1.5 rounded-full shrink-0",
              syncStatus.isStale
                ? "bg-warning animate-pulse"
                : "bg-success animate-pulse",
            )}
            aria-hidden
          />
          <span
            className="text-[11px] text-muted-foreground leading-tight"
            suppressHydrationWarning
          >
            {syncStatus.label}
          </span>
        </div>

        <div className="flex items-center gap-1 px-1">
          <span
            className="flex-1 text-[11px] text-muted-foreground truncate min-w-0"
            title={email}
          >
            {email}
          </span>
          <form id="sidebar-signout" action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              aria-label="Sign out"
              suppressHydrationWarning
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
