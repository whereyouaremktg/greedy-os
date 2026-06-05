"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";

import {
  createPurchaseOrderCore,
  fetchPurchaseOrderDetail,
  updatePoShipmentCore,
  updatePoStatusCore,
} from "@/lib/purchase-orders/core";
import {
  createPurchaseOrderInputSchema,
  parsedPurchaseOrderSchema,
  parsedToCreateInput,
  type CreatePurchaseOrderInput,
} from "@/lib/purchase-orders/schema";
import type { PoStatus } from "@/lib/purchase-orders/statuses";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<
  ActionResult<{
    id: string;
    po_number: string | null;
    vendor_name: string;
    total: number;
    line_item_count: number;
    total_units: number;
  }>
> {
  const parsed = createPurchaseOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const created = await createPurchaseOrderCore(
    supabase,
    user?.id ?? null,
    parsed.data,
  );

  if (!created.ok) {
    return { ok: false, error: created.error.message };
  }

  revalidateTimelinePaths();
  revalidatePath("/vendors");

  return { ok: true, data: created.data };
}

export async function createPurchaseOrderFromParsed(
  parsed: z.infer<typeof parsedPurchaseOrderSchema>,
  vendorId?: string,
): Promise<
  ActionResult<{
    id: string;
    po_number: string | null;
    vendor_name: string;
    total: number;
    line_item_count: number;
    total_units: number;
  }>
> {
  const validated = parsedPurchaseOrderSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, error: flattenZod(validated.error) };
  }

  return createPurchaseOrder(
    parsedToCreateInput(validated.data, vendorId),
  );
}

export async function getPurchaseOrderDetail(id: string) {
  const idResult = z.string().uuid().safeParse(id);
  if (!idResult.success) {
    return { ok: false as const, error: "Invalid purchase order id" };
  }

  const supabase = await createClient();
  const detail = await fetchPurchaseOrderDetail(supabase, idResult.data);

  if (!detail.ok) {
    return { ok: false as const, error: detail.error.message };
  }

  return { ok: true as const, data: detail.data };
}

const poStatusSchema = z.enum([
  "draft",
  "sent",
  "confirmed",
  "in_fulfillment",
  "shipped",
  "partially_received",
  "received",
  "closed",
  "cancelled",
]);

export async function updatePoStatus(
  id: string,
  status: PoStatus,
): Promise<ActionResult<{ id: string; status: PoStatus }>> {
  const parsed = z
    .object({ id: z.string().uuid(), status: poStatusSchema })
    .safeParse({ id, status });

  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const result = await updatePoStatusCore(
    supabase,
    parsed.data.id,
    parsed.data.status,
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateTimelinePaths();
  revalidatePath("/purchase-orders");

  return { ok: true, data: result.data };
}

const updatePoShipmentSchema = z.object({
  id: z.string().uuid(),
  ship_date: z.string().nullable().optional(),
  tracking_number: z.string().nullable().optional(),
  carrier: z.string().nullable().optional(),
});

export async function updatePoShipment(
  input: z.infer<typeof updatePoShipmentSchema>,
): Promise<
  ActionResult<{
    id: string;
    ship_date: string | null;
    tracking_number: string | null;
    carrier: string | null;
  }>
> {
  const parsed = updatePoShipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const { id, ...shipment } = parsed.data;
  const supabase = await createClient();
  const result = await updatePoShipmentCore(supabase, id, shipment);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath("/purchase-orders");

  return { ok: true, data: result.data };
}
