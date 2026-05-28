import {
  CONNECTORS,
  getConnectorStatus,
  getQuickbooksConnectionState,
} from "@/lib/connectors/credentials";
import { ConnectorCard } from "@/components/settings/connector-card";
import { QuickbooksCard } from "@/components/settings/quickbooks-card";
import { QbResultToast } from "@/components/settings/qb-result-toast";
import { SlackIdentitiesCard } from "@/components/settings/slack-identities-card";
import { PageHeader } from "@/components/nav/page-header";
import { loadSlackIdentitiesSettings } from "@/lib/settings/slack-identities-data";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [statuses, qbState, slackIdentities] = await Promise.all([
    Promise.all(
      CONNECTORS.map(async (c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        fields: c.fields,
        statuses: await getConnectorStatus(c.id),
      })),
    ),
    getQuickbooksConnectionState(),
    loadSlackIdentitiesSettings(),
  ]);

  return (
    <div className="space-y-6">
      <QbResultToast />
      <PageHeader
        title="Settings"
        description="Connect your data sources. Pasted keys are stored in Supabase (server-only) and used by the cron pullers. Values set via Vercel environment variables also keep working — anything pasted here overrides them."
      />

      <SlackIdentitiesCard
        rows={slackIdentities.rows}
        authUsers={slackIdentities.authUsers}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {statuses.map((c) =>
          c.id === "quickbooks" ? (
            <QuickbooksCard
              key={c.id}
              id="quickbooks"
              label={c.label}
              description={c.description}
              fields={c.fields}
              statuses={c.statuses}
              state={qbState}
            />
          ) : (
            <ConnectorCard
              key={c.id}
              id={c.id}
              label={c.label}
              description={c.description}
              fields={c.fields}
              statuses={c.statuses}
            />
          ),
        )}
      </section>
    </div>
  );
}
