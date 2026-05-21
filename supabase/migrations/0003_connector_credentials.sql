-- Connector credentials store backing the in-app /settings UI.
-- Each row is one (connector, key) pair (e.g. ('hubspot', 'HUBSPOT_PRIVATE_APP_TOKEN')).
-- Writes happen via server actions using the service-role client.
-- RLS is enabled with NO policies — authenticated clients cannot read the
-- values at all; the UI gets only a "saved" boolean via a server action.
-- Stored in plaintext: acceptable for the two-user, single-tenant trust
-- model; revisit (pgsodium) if the user model widens.

create table public.connector_credentials (
  connector text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),
  primary key (connector, key)
);

create trigger connector_credentials_set_updated_at
  before update on public.connector_credentials
  for each row execute function public.set_updated_at();

alter table public.connector_credentials enable row level security;
-- Intentionally no policies. Only the service-role client (cron pullers
-- and server actions) may read or write.
