export type GlowToolError = { code: string; message: string };

export type GlowToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GlowToolError };

export type VendorListItem = { id: string; name: string };

export type ProductListItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  active: boolean;
};

export type RunListItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  variant: string | null;
  quantity: number;
  stage: string;
  vendor_name: string;
  expected_arrival_date: string | null;
  expected_completion_date: string | null;
};

export type RunWriteResult = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  stage: string;
  vendor_name: string;
  expected_arrival_date?: string | null;
  expected_completion_date?: string | null;
  actual_arrival_date?: string | null;
  actual_completion_date?: string | null;
};

export type PoWriteResult = {
  id: string;
  po_number: string | null;
  vendor_name: string;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  total: number;
  line_item_count: number;
  total_units: number;
};

export function isGlowToolResult(value: unknown): value is GlowToolResult<unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as { ok?: boolean };
  return v.ok === true || v.ok === false;
}
