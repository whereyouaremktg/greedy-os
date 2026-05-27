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
  LogOut,
  Settings,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import type { GlobalSyncStatus } from "@/lib/dashboard/sync-status";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/purchase-orders", label: "Purchase Orders", icon: FileText },
  { href: "/manufacturing", label: "Manufacturing", icon: Factory },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/products", label: "Products", icon: Package },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  email,
  syncStatus,
}: {
  email: string;
  syncStatus: GlobalSyncStatus;
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
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
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
              {label}
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
          <ThemeToggle />
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
