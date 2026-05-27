-- Landed cost and margin fields for manufacturing runs (from MO upload costing panel).

alter table public.manufacturing_runs
  add column if not exists product_cost_usd numeric(14,2),
  add column if not exists sell_price_per_unit_usd numeric(14,2),
  add column if not exists air_freight_usd numeric(14,2),
  add column if not exists sea_freight_usd numeric(14,2),
  add column if not exists air_landed_per_unit_usd numeric(14,2),
  add column if not exists sea_landed_per_unit_usd numeric(14,2),
  add column if not exists air_margin_per_unit_usd numeric(14,2),
  add column if not exists sea_margin_per_unit_usd numeric(14,2),
  add column if not exists air_margin_percent numeric(5,2),
  add column if not exists sea_margin_percent numeric(5,2);
