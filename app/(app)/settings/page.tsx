import {
  CONNECTORS,
  getConnectorStatus,
} from "@/lib/connectors/credentials";
import { ConnectorCard } from "@/components/settings/connector-card";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const statuses = await Promise.all(
    CONNECTORS.map(async (c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      fields: c.fields,
      statuses: await getConnectorStatus(c.id),
    })),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connect your data sources. Pasted keys are stored in Supabase
          (server-only) and used by the cron pullers. Values set via Vercel
          environment variables also keep working — anything pasted here
          overrides them.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {statuses.map((c) => (
          <ConnectorCard
            key={c.id}
            id={c.id}
            label={c.label}
            description={c.description}
            fields={c.fields}
            statuses={c.statuses}
          />
        ))}
      </section>
    </div>
  );
}
