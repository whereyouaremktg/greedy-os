import type { Database } from "@/types/db";

export type PoStatus = Database["public"]["Enums"]["po_status"];

/** Columns on the wholesale PO Kanban board (left → right). */
export const PO_BOARD_STATUSES: PoStatus[] = [
  "confirmed",
  "in_fulfillment",
  "shipped",
  "received",
  "closed",
];

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  draft: "Draft",
  sent: "In fulfillment",
  confirmed: "Confirmed",
  in_fulfillment: "In fulfillment",
  shipped: "Shipped",
  partially_received: "Partially shipped",
  received: "Delivered",
  closed: "Paid",
  cancelled: "Cancelled",
};

export function formatPoStatusLabel(status: PoStatus | string): string {
  return PO_STATUS_LABELS[status as PoStatus] ?? status.replace(/_/g, " ");
}

/** Which board column a PO appears in (handles legacy statuses). */
export function poBoardColumn(status: PoStatus): PoStatus {
  switch (status) {
    case "draft":
    case "sent":
      return "confirmed";
    case "partially_received":
      return "shipped";
    case "cancelled":
      return "cancelled";
    default:
      return PO_BOARD_STATUSES.includes(status) ? status : "confirmed";
  }
}

export function isPoOnBoard(status: PoStatus): boolean {
  return status !== "cancelled" && status !== "draft";
}
