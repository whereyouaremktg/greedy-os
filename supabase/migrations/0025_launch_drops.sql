-- Greedy OS — Q4 Targets stage 4: launch tracker (brush drops).
--
-- Manual entry: name, drop date, planned units and the SKUs that make up the
-- drop. Sell-through is computed at read time from shopify_order_lines
-- (paid buckets only, from the drop date on). OWNED: authenticated read + write.
create table if not exists public.launch_drops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  drop_date date not null,
  planned_units integer,
  skus text[] not null default '{}',
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger launch_drops_set_updated_at before update on public.launch_drops
  for each row execute function public.set_updated_at();

create index if not exists launch_drops_drop_date_idx on public.launch_drops (drop_date);

alter table public.launch_drops enable row level security;
do $$ begin
  create policy "auth read" on public.launch_drops for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "auth write" on public.launch_drops for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Daily units + revenue for a set of SKUs (launch sell-through), paid
-- revenue buckets only. Revenue = discounted line total scaled to the
-- quantity still on the order (refunds net out).
create or replace function public.targets_sku_daily(p_start date, p_end date, p_skus text[], p_buckets text[])
returns table (day_local date, sku text, units bigint, revenue numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    o.day_local,
    l.sku,
    coalesce(sum(l.current_quantity), 0)::bigint as units,
    coalesce(sum(case when l.quantity > 0 then l.discounted * l.current_quantity / l.quantity else 0 end), 0)::numeric as revenue
  from public.shopify_order_lines l
  join public.shopify_orders o on o.id = l.order_id
  where l.sku = any (p_skus)
    and o.day_local between p_start and p_end
    and o.bucket = any (p_buckets)
  group by 1, 2
  order by 1, 2;
$$;

grant execute on function public.targets_sku_daily(date, date, text[], text[]) to authenticated, service_role;
