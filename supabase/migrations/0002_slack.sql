-- Slack outbound notification dedupe log (service-role writes only)

create table public.slack_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  channel text not null,
  message_ts text,
  payload jsonb not null,
  sent_at timestamptz not null default now()
);

alter table public.slack_notifications enable row level security;

create policy "auth read" on public.slack_notifications
  for select to authenticated using (true);
