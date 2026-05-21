import { KpiTile } from "@/components/dashboard/kpi-tile";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function DashboardPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            One question per tile. All metrics read from the cache, refreshed
            on a schedule.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiTile
            title="Cash position"
            value="—"
            hint="QuickBooks · pulled every 6h"
            status="pending"
          />
          <KpiTile
            title="AR aging"
            value="—"
            hint="0/30/60/90+ from QuickBooks"
            status="pending"
          />
          <KpiTile
            title="DTC revenue (30d)"
            value="—"
            hint="Shopify · pulled every 2h"
            status="pending"
          />
          <KpiTile
            title="AOV"
            value="—"
            hint="Shopify"
            status="pending"
          />
          <KpiTile
            title="Email + affiliate revenue"
            value="—"
            hint="Klaviyo · pulled every 4h"
            status="pending"
          />
          <KpiTile
            title="Wholesale pipeline"
            value="—"
            hint="HubSpot · pulled every 6h"
            status="pending"
          />
          <KpiTile
            title="POs due / overdue"
            value="—"
            hint="Owned · po_payments"
            status="pending"
          />
          <KpiTile
            title="In production"
            value="—"
            hint="Owned · manufacturing_runs"
            status="pending"
          />
        </div>
      </div>

      <div className="lg:sticky lg:top-8 lg:self-start lg:h-[calc(100vh-4rem)]">
        <ChatPanel />
      </div>
    </div>
  );
}
