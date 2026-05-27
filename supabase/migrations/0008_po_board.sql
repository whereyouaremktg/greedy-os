-- Wholesale PO board: fulfillment statuses + shipment tracking.

ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'in_fulfillment';
ALTER TYPE po_status ADD VALUE IF NOT EXISTS 'shipped';

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS ship_date date,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS carrier text;
