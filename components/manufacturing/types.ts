import type { ManufacturingStage } from "@/lib/manufacturing/stages";

export type ManufacturingRunRow = {
  id: string;
  vendor_id: string;
  purchase_order_id: string | null;
  product_id: string | null;
  product_name: string;
  variant: string | null;
  quantity: number;
  stage: ManufacturingStage;
  expected_completion_date: string | null;
  expected_arrival_date: string | null;
  actual_completion_date: string | null;
  actual_arrival_date: string | null;
  notes: string | null;
  product_cost_usd: number | null;
  sell_price_per_unit_usd: number | null;
  air_freight_usd: number | null;
  sea_freight_usd: number | null;
  air_landed_per_unit_usd: number | null;
  sea_landed_per_unit_usd: number | null;
  air_margin_per_unit_usd: number | null;
  sea_margin_per_unit_usd: number | null;
  air_margin_percent: number | null;
  sea_margin_percent: number | null;
  created_at: string;
  updated_at: string;
  vendor_name: string;
};

export type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
};

export type VendorOption = {
  id: string;
  name: string;
};

export type PurchaseOrderOption = {
  id: string;
  po_number: string | null;
  vendor_id: string;
};
