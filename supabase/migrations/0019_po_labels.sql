-- Anthropologie (and similar) orders require buying compliance LABELS from the
-- retailer's supplier before shipping — a key fulfillment step. Track whether
-- they've been ordered, what they cost, and any supplier reference, per PO.

alter table public.purchase_orders
  add column if not exists labels_ordered boolean not null default false,
  add column if not exists labels_cost numeric(12, 2),
  add column if not exists labels_note text;
