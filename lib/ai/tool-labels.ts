import type { GlowToolResult, PoWriteResult, RunWriteResult } from "@/lib/ai/tool-results";
import { formatStageLabel } from "@/lib/manufacturing/stages";

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatToolSuccessLabel(
  toolName: string,
  output: GlowToolResult<unknown>,
): string {
  if (!output.ok) return output.error.message;

  const data = output.data as RunWriteResult;

  switch (toolName) {
    case "createVendor": {
      const vendor = output.data as { id: string; name: string };
      return `Created vendor #${shortId(vendor.id)} — ${vendor.name}`;
    }
    case "createManufacturingRun":
      return `Created run #${shortId(data.id)} — ${data.quantity.toLocaleString()} units ${data.product_name} → ${data.vendor_name}`;
    case "updateRunStage":
      return `Updated run #${shortId(data.id)} → ${formatStageLabel(data.stage as never)}`;
    case "updateRunArrival":
      return `Updated dates for run #${shortId(data.id)} — ${data.product_name}`;
    case "createPurchaseOrder": {
      const po = output.data as PoWriteResult;
      const label = po.po_number ? `PO ${po.po_number}` : "Purchase order";
      return `Created ${label} — ${po.line_item_count} styles, ${po.total_units.toLocaleString()} units`;
    }
    case "createCampaign": {
      const c = output.data as { id: string; name: string };
      return `Created campaign #${shortId(c.id)} — ${c.name}`;
    }
    case "addCampaignTask": {
      const t = output.data as { id: string; title: string };
      return `Added task #${shortId(t.id)} — ${t.title}`;
    }
    case "listPurchaseOrders":
      return "Listed purchase orders";
    case "listVendors":
      return "Listed vendors";
    case "listManufacturingRuns":
      return "Listed manufacturing runs";
    case "listCampaigns":
      return "Listed campaigns";
    default:
      return `Completed ${toolName}`;
  }
}

export function formatToolRunningLabel(toolName: string): string {
  switch (toolName) {
    case "createVendor":
      return "Creating vendor";
    case "createManufacturingRun":
      return "Creating manufacturing run";
    case "updateRunStage":
      return "Updating run stage";
    case "updateRunArrival":
      return "Updating run dates";
    case "createPurchaseOrder":
      return "Creating purchase order";
    case "createCampaign":
      return "Creating campaign";
    case "addCampaignTask":
      return "Adding campaign task";
    case "listPurchaseOrders":
      return "Looking up purchase orders";
    case "listVendors":
      return "Looking up vendors";
    case "listManufacturingRuns":
      return "Looking up runs";
    case "listCampaigns":
      return "Looking up campaigns";
    default:
      return toolName;
  }
}

export function isWriteTool(toolName: string): boolean {
  return (
    toolName === "createVendor" ||
    toolName === "createManufacturingRun" ||
    toolName === "createPurchaseOrder" ||
    toolName === "updateRunStage" ||
    toolName === "updateRunArrival" ||
    toolName === "createCampaign" ||
    toolName === "addCampaignTask"
  );
}
