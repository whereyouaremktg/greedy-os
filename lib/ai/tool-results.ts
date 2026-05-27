export type GlowToolError = { code: string; message: string };

export type GlowToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: GlowToolError };

export type VendorListItem = { id: string; name: string };

export type RunListItem = {
  id: string;
  product_name: string;
  variant: string | null;
  quantity: number;
  stage: string;
  vendor_name: string;
  expected_arrival_date: string | null;
  expected_completion_date: string | null;
};

export type RunWriteResult = {
  id: string;
  product_name: string;
  quantity: number;
  stage: string;
  vendor_name: string;
  expected_arrival_date?: string | null;
  expected_completion_date?: string | null;
  actual_arrival_date?: string | null;
  actual_completion_date?: string | null;
};

export function isGlowToolResult(value: unknown): value is GlowToolResult<unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as { ok?: boolean };
  return v.ok === true || v.ok === false;
}
