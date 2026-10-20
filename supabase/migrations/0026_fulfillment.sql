-- Q4 Targets: fulfillment as a cost of goods.
--
-- ShipHero (RetroShip) shipments carry the actual postage per label. We mirror
-- one row per shipment (MIRRORED: authenticated read, service-role writes) and
-- join to shopify_orders by order name, so the dashboard can show postage per
-- order, postage vs shipping charged, carrier mix, and feed the fulfillment
-- estimate into the weekly margin math when no RetroShip invoice is entered.

create table if not exists public.shiphero_shipments (
  id text primary key,                        -- ShipHero shipment id (base64 gid)
  order_id text,                              -- ShipHero order id
  order_number text,                          -- "#73074" for Shopify orders; retailer PO for Manual Orders
  shop_name text,                             -- "glow-beauty-hair.myshopify.com" | "Manual Order" | ...
  created_at timestamptz not null,            -- label/shipment created (ShipHero created_date, UTC)
  day_local date not null,                    -- created_at in the store timezone
  warehouse_id text,
  country text,
  label_count integer not null default 0,     -- valid (non-voided) labels
  postage numeric(10,2) not null default 0,   -- Σ cost of valid labels
  carrier text,                               -- first valid label's carrier (dhl_ecommerce, uni_uni, ...)
  shipping_method text,                       -- first valid label's shipping_name (Economy, Priority, ...)
  box_name text,
  weight_lb numeric(8,3),
  labels jsonb not null default '[]'::jsonb,  -- [{carrier, method, cost, status, tracking}] for audit
  synced_at timestamptz not null default now()
);

create index if not exists shiphero_shipments_order_number_idx on public.shiphero_shipments (order_number);
create index if not exists shiphero_shipments_day_local_idx on public.shiphero_shipments (day_local);

alter table public.shiphero_shipments enable row level security;
do $$ begin
  create policy "auth read" on public.shiphero_shipments for select to authenticated using (true);
exception when duplicate_object then null; end $$;
-- No write policy on purpose: only the service-role puller writes.

-- Weekly fulfillment facts for revenue-bucket orders: how many orders, what
-- we charged customers for shipping, how many of those orders have a ShipHero
-- shipment (matched by order name, Manual Orders excluded), the postage on
-- those, and how fast orders went out (Shopify first fulfillment).
create or replace function public.targets_fulfillment_weekly(p_start date, p_end date, p_buckets text[])
returns table (
  week_start date,
  orders bigint,
  units bigint,
  shipping_charged numeric,
  shipped_orders bigint,
  shipments bigint,
  postage numeric,
  avg_hours_to_ship numeric,
  p50_hours_to_ship numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with o as (
    select
      o.id, o.name, o.day_local, o.units, o.shipping,
      extract(epoch from (o.first_fulfilled_at - o.created_at)) / 3600.0 as hours_to_ship
    from public.shopify_orders o
    where o.day_local between p_start and p_end
      and o.bucket = any (p_buckets)
  ),
  s as (
    -- Shipments without a label cost (generic / hand labels) carry no postage
    -- information, so their orders count as unmatched and get extrapolated.
    select s.order_number, count(*)::bigint as shipments, sum(s.postage)::numeric as postage
    from public.shiphero_shipments s
    where s.shop_name is distinct from 'Manual Order'
      and s.label_count > 0 and s.postage > 0
      and s.day_local between p_start - 7 and p_end + 45
    group by s.order_number
  )
  select
    date_trunc('week', o.day_local)::date as week_start,
    count(*)::bigint as orders,
    coalesce(sum(o.units), 0)::bigint as units,
    coalesce(sum(o.shipping), 0)::numeric as shipping_charged,
    count(s.order_number)::bigint as shipped_orders,
    coalesce(sum(s.shipments), 0)::bigint as shipments,
    coalesce(sum(s.postage), 0)::numeric as postage,
    avg(o.hours_to_ship) filter (where o.hours_to_ship is not null and o.hours_to_ship >= 0)::numeric as avg_hours_to_ship,
    percentile_cont(0.5) within group (order by o.hours_to_ship)
      filter (where o.hours_to_ship is not null and o.hours_to_ship >= 0)::numeric as p50_hours_to_ship
  from o
  left join s on s.order_number = o.name
  group by 1
  order by 1;
$$;

grant execute on function public.targets_fulfillment_weekly(date, date, text[]) to authenticated, service_role;

-- Carrier / service mix for the same matched orders.
create or replace function public.targets_fulfillment_carriers(p_start date, p_end date, p_buckets text[])
returns table (
  carrier text,
  shipping_method text,
  shipments bigint,
  postage numeric,
  avg_weight_lb numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(s.carrier, 'unknown') as carrier,
    coalesce(s.shipping_method, '—') as shipping_method,
    count(*)::bigint as shipments,
    coalesce(sum(s.postage), 0)::numeric as postage,
    avg(s.weight_lb)::numeric as avg_weight_lb
  from public.shiphero_shipments s
  join public.shopify_orders o on o.name = s.order_number
  where s.shop_name is distinct from 'Manual Order'
    and s.label_count > 0 and s.postage > 0
    and o.day_local between p_start and p_end
    and o.bucket = any (p_buckets)
  group by 1, 2
  order by 3 desc, 1, 2;
$$;

grant execute on function public.targets_fulfillment_carriers(date, date, text[]) to authenticated, service_role;
