import type { PoStatus } from "@/lib/purchase-orders/statuses";

export type PoPaymentSummary = {
  unpaid_count: number;
  unpaid_total: number;
  all_paid: boolean;
};

export type PoRow = {
  id: string;
  po_number: string | null;
  status: PoStatus;
  order_date: string | null;
  expected_date: string | null;
  ship_date: string | null;
  tracking_number: string | null;
  carrier: string | null;
  total: number;
  vendor_name: string;
  line_item_count: number;
  total_units: number;
  updated_at: string;
  payments: PoPaymentSummary;
};
