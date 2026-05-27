-- Per-line metadata for wholesale POs (e.g. REVOLVE cancel dates, style numbers).

alter table public.po_line_items
  add column if not exists cancel_date date,
  add column if not exists retail_price numeric(14,2),
  add column if not exists style_number text,
  add column if not exists color text;

create index if not exists po_line_items_cancel_date_idx
  on public.po_line_items (cancel_date)
  where cancel_date is not null;
