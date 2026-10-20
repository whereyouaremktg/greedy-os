-- Greedy OS — Q4 Targets stage 3: wholesale PO tracker fields + profitability inputs.
--
-- purchase_orders already holds the wholesale buyer POs (vendors = retail
-- partners). The tracker needs the invoice/paid dates to decide what counts
-- toward Q4 (invoiced) vs "booked but not invoiced".
alter table public.purchase_orders
  add column if not exists invoice_date date,
  add column if not exists invoice_number text,
  add column if not exists invoiced_amount numeric(14,2),
  add column if not exists paid_date date;

create index if not exists purchase_orders_invoice_date_idx on public.purchase_orders (invoice_date);

-- Partners named in the Q4 plan. Vendors are OWNED rows; insert only the
-- missing names (case-insensitive) so existing rows and their POs are untouched.
insert into public.vendors (name, notes)
select v.name, 'Wholesale partner (Q4 2026 plan)'
from (values ('REVOLVE'), ('ANTHROPOLOGIE'), ('URBAN OUTFITTERS'), ('NORDSTROM'), ('TARGET')) as v(name)
where not exists (
  select 1 from public.vendors x where lower(x.name) = lower(v.name)
);

-- Per-SKU landed unit cost for gross margin. Manual; null = unknown (the
-- dashboard reports COGS coverage so partial data is visible, not hidden).
alter table public.products
  add column if not exists unit_cost_usd numeric(12,2);

-- Weekly manual inputs the profitability panel cannot pull from a connector:
-- ad spend by platform, 3PL cost, other operating expenses. Week = Monday
-- (store-local). OWNED: authenticated read + write.
create table if not exists public.targets_weekly_inputs (
  week_start date primary key,
  ad_spend_meta numeric(14,2),
  ad_spend_tiktok numeric(14,2),
  ad_spend_google numeric(14,2),
  ad_spend_other numeric(14,2),
  threepl_cost numeric(14,2),
  other_opex numeric(14,2),
  cogs_override numeric(14,2),      -- replaces the SKU-cost COGS estimate when set
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

alter table public.targets_weekly_inputs enable row level security;
do $$ begin
  create policy "auth read" on public.targets_weekly_inputs for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth write" on public.targets_weekly_inputs for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Weekly COGS estimate from SKU unit costs, for the profitability panel.
-- Weeks start Monday (date_trunc 'week'). Only product lines in the given
-- revenue buckets count. security invoker: RLS on the underlying tables applies.
create or replace function public.targets_weekly_cogs(p_start date, p_end date, p_buckets text[])
returns table (week_start date, units bigint, units_with_cost bigint, cogs numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    date_trunc('week', o.day_local)::date as week_start,
    coalesce(sum(l.current_quantity), 0)::bigint as units,
    coalesce(sum(case when c.unit_cost_usd is not null then l.current_quantity else 0 end), 0)::bigint as units_with_cost,
    coalesce(sum(case when c.unit_cost_usd is not null then l.current_quantity * c.unit_cost_usd else 0 end), 0)::numeric as cogs
  from public.shopify_order_lines l
  join public.shopify_orders o on o.id = l.order_id
  left join lateral (
    select p.unit_cost_usd from public.products p
    where p.sku = l.sku and p.unit_cost_usd is not null
    limit 1
  ) c on true
  where l.is_product
    and o.day_local between p_start and p_end
    and o.bucket = any (p_buckets)
  group by 1
  order by 1;
$$;

grant execute on function public.targets_weekly_cogs(date, date, text[]) to authenticated, service_role;
