import type { Database } from "@/types/db";

export type ManufacturingStage =
  Database["public"]["Enums"]["manufacturing_stage"];

export const MANUFACTURING_STAGES: ManufacturingStage[] = [
  "ordered",
  "in_production",
  "complete",
  "in_transit",
  "received",
];

export const STAGE_LABELS: Record<ManufacturingStage, string> = {
  ordered: "Ordered",
  in_production: "In production",
  complete: "Complete",
  in_transit: "In transit",
  received: "Received",
};

export function formatStageLabel(stage: ManufacturingStage): string {
  return STAGE_LABELS[stage];
}
