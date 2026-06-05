-- Enrich shopify_metrics with traffic, customer mix, geography, and tag
-- attribution captured by the daily puller.
--
-- sessions / conversion_rate come from the ShopifyQL `sessions` dataset
-- (conversion_rate = order_count / sessions). new/returning are derived from
-- the ordering customer's lifetime order count. top_provinces and tag_revenue
-- are small JSON rollups (province -> {revenue, orders}, tag -> {revenue, orders}).

alter table public.shopify_metrics
  add column if not exists sessions integer,
  add column if not exists conversion_rate numeric(6, 4),
  add column if not exists new_customer_count integer,
  add column if not exists returning_customer_count integer,
  add column if not exists top_provinces jsonb,
  add column if not exists tag_revenue jsonb;
