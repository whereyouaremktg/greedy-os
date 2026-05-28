import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { ViewTransitionWrapper } from "@/components/providers/view-transition-wrapper";
import { AnalystDrawerProvider } from "@/components/chat/analyst-drawer";
import {
  getGlobalSyncStatus,
  getNavCounters,
} from "@/lib/dashboard/sync-status";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [syncStatus, navCounters] = await Promise.all([
    getGlobalSyncStatus(supabase),
    getNavCounters(supabase),
  ]);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        email={user.email ?? ""}
        syncStatus={syncStatus}
        navCounters={navCounters}
      />
      <AnalystDrawerProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={user.email ?? ""} syncStatus={syncStatus} />
          <main className="flex-1 overflow-x-auto p-5">
            <ViewTransitionWrapper>{children}</ViewTransitionWrapper>
          </main>
        </div>
      </AnalystDrawerProvider>
    </div>
  );
}
