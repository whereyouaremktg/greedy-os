-- Audit + idempotency log for inbound PO emails (forwarded to the monitored
-- address, delivered via Postmark's inbound webhook). message_id is the PK so a
-- webhook retry can't create the same PO twice.

create table if not exists public.inbound_email_log (
  message_id text primary key,
  sender text,
  subject text,
  po_id uuid references public.purchase_orders(id) on delete set null,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now()
);

alter table public.inbound_email_log enable row level security;

-- Authenticated reads (audit trail in-app); the service-role webhook writes.
create policy "auth read"
  on public.inbound_email_log for select
  to authenticated
  using (true);
