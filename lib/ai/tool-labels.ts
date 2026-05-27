import type { GlowToolResult, RunWriteResult } from "@/lib/ai/tool-results";
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
    case "listVendors":
      return "Listed vendors";
    case "listManufacturingRuns":
      return "Listed manufacturing runs";
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
    case "listVendors":
      return "Looking up vendors";
    case "listManufacturingRuns":
      return "Looking up runs";
    default:
      return toolName;
  }
}

export function isWriteTool(toolName: string): boolean {
  return (
    toolName === "createVendor" ||
    toolName === "createManufacturingRun" ||
    toolName === "updateRunStage" ||
    toolName === "updateRunArrival"
  );
}
