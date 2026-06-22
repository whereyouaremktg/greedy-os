-- Glow OS — enrich shiphero_inbound_pos for full inbound-shipment visibility.
--
-- The first cut captured only status + ordered/received totals. ShipHero's
-- PurchaseOrder also exposes the receiving timeline and freight/tracking detail,
-- so we add it here. Glow's account does NOT use ShipHero's freight `inbound_shipments`
-- module (empty), so the PurchaseOrder is the authoritative inbound record.
--
-- All additive + idempotent. Receiving timestamps are the headline:
--   date_closed       = PO closed out (receiving complete)
--   last_received_at  = most recent per-line receipt timestamp (derived in puller)
--   arrived_at        = ShipHero arrival field (often null for Glow; kept for completeness)

alter table public.shiphero_inbound_pos
  add column if not exists po_created_at timestamptz,        -- when the PO was created in ShipHero
  add column if not exists arrived_at timestamptz,           -- ShipHero arrival (frequently null)
  add column if not exists date_closed timestamptz,          -- receiving complete / PO closed
  add column if not exists ship_date timestamptz,            -- vendor ship date
  add column if not exists last_received_at timestamptz,     -- max(line.updated_at) — "last put into inventory"
  add column if not exists total_rejected integer not null default 0,
  add column if not exists tracking_number text,
  add column if not exists shipping_carrier text,
  add column if not exists partner_order_number text,
  add column if not exists po_note text;

-- Query "what was received recently" fast.
create index if not exists shiphero_inbound_pos_received_idx
  on public.shiphero_inbound_pos (last_received_at desc nulls last);
create index if not exists shiphero_inbound_pos_closed_idx
  on public.shiphero_inbound_pos (date_closed desc nulls last);
