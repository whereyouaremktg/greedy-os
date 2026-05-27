-- Manual Slack user ↔ Glow OS auth user mappings (service-role writes from Slack + settings actions)

create table public.slack_identities (
  slack_user_id text primary key,
  supabase_user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  linked_at timestamptz not null default now()
);

create index slack_identities_supabase_user_id_idx
  on public.slack_identities (supabase_user_id);

alter table public.slack_identities enable row level security;

create policy "auth read" on public.slack_identities
  for select to authenticated using (true);

create policy "auth write" on public.slack_identities
  for all to authenticated using (true) with check (true);
