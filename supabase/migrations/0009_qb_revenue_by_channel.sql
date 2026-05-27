-- Daily DTC vs Wholesale revenue split, sourced from the QuickBooks
-- ProfitAndLoss report grouped by Class. The QB puller fills this in
-- alongside qb_financials on the same 6h schedule.
--
-- "other" captures anything that doesn't match the DTC or wholesale
-- heuristics (legacy classes, unclassified line items, etc.) so the
-- channel split always reconciles to total revenue.
--
-- Same RLS pattern as the other mirrored tables: authenticated users
-- can read, service-role writes via the puller.

create table public.qb_revenue_by_channel (
  as_of_date date primary key,
  dtc_revenue numeric(14,2),
  wholesale_revenue numeric(14,2),
  other_revenue numeric(14,2),
  total_revenue numeric(14,2),
  classes jsonb,                       -- raw { className: amount } for audit
  synced_at timestamptz not null default now()
);

alter table public.qb_revenue_by_channel enable row level security;

create policy "auth read" on public.qb_revenue_by_channel
  for select to authenticated using (true);
