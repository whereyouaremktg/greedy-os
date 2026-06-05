-- Split Shopify revenue into DTC vs. Wholesale (B2B) inside shopify_metrics.
--
-- Shopify B2B orders are identified by order tags containing "B2B" or
-- "Wholesale" (case-insensitive); everything else is DTC. The puller fills
-- these alongside the existing grand totals on the same 2h schedule.
--
-- `revenue` / `order_count` stay as the grand total (DTC + wholesale) for
-- back-compat. dtc_revenue + wholesale_revenue reconcile to `revenue`.

alter table public.shopify_metrics
  add column if not exists dtc_revenue numeric(14,2),
  add column if not exists wholesale_revenue numeric(14,2),
  add column if not exists wholesale_order_count integer;
