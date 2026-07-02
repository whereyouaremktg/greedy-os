-- Inbound email threads for the PO/manufacturing monitoring agent.
-- Every email delivered to the monitored inboxes (receiving@ / product@) is
-- stored here as part of a thread, linked to a manufacturing run or wholesale
-- PO, and carries the extraction agent's latest structured read of the thread.
-- inbound_email_log stays as the legacy audit table for the old wholesale path.

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  stream text not null check (stream in ('manufacturing', 'wholesale')),
  message_id text not null unique,
  thread_key text not null,
  in_reply_to text,
  "references" text,
  from_email text,
  subject text,
  text_body text,
  html_body text,
  attachments jsonb not null default '[]'::jsonb,
  matched_entity_type text check (matched_entity_type in ('manufacturing_run', 'purchase_order')),
  matched_entity_id uuid,
  extraction jsonb,
  status text not null default 'received'
    check (status in ('received', 'linked', 'applied', 'needs_review', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists inbound_messages_thread_key_idx
  on public.inbound_messages (thread_key, received_at);
create index if not exists inbound_messages_entity_idx
  on public.inbound_messages (matched_entity_type, matched_entity_id);
create index if not exists inbound_messages_status_idx
  on public.inbound_messages (status);

alter table public.inbound_messages enable row level security;

-- Authenticated reads (Correspondence UI); the service-role webhook writes.
create policy "auth read"
  on public.inbound_messages for select
  to authenticated
  using (true);

-- Private bucket for original PDF/image attachments; rows keep a storage ref
-- in attachments jsonb. Service role uploads; the app signs URLs for reads.
insert into storage.buckets (id, name, public)
values ('inbound-attachments', 'inbound-attachments', false)
on conflict (id) do nothing;
