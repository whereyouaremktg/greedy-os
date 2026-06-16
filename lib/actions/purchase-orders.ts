"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";

import {
  createPurchaseOrderCore,
  fetchPurchaseOrderDetail,
  updatePoDetailsCore,
  updatePoLabelsCore,
  updatePoLineCostsCore,
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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const updatePoDetailsSchema = z.object({
  id: z.string().uuid(),
  po_number: z.string().max(100).nullable().optional(),
  status: poStatusSchema.optional(),
  order_date: isoDate.nullable().optional(),
  expected_date: isoDate.nullable().optional(),
});

export async function updatePoDetails(
  input: z.infer<typeof updatePoDetailsSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updatePoDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const { id, ...details } = parsed.data;
  const supabase = await createClient();
  const result = await updatePoDetailsCore(supabase, id, details);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateTimelinePaths();
  revalidatePath("/purchase-orders");
  return { ok: true, data: result.data };
}

const updatePoLabelsSchema = z.object({
  id: z.string().uuid(),
  labels_ordered: z.boolean().optional(),
  labels_cost: z.number().nonnegative().nullable().optional(),
  labels_note: z.string().max(2000).nullable().optional(),
});

export async function updatePoLabels(
  input: z.infer<typeof updatePoLabelsSchema>,
): Promise<
  ActionResult<{
    id: string;
    labels_ordered: boolean;
    labels_cost: number | null;
    labels_note: string | null;
  }>
> {
  const parsed = updatePoLabelsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const { id, ...labels } = parsed.data;
  const supabase = await createClient();
  const result = await updatePoLabelsCore(supabase, id, labels);

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath("/purchase-orders");
  return { ok: true, data: result.data };
}

const updatePoLineCostsSchema = z.object({
  id: z.string().uuid(),
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        unit_cost: z.number().nonnegative(),
      }),
    )
    .min(1),
});

export async function updatePoLineCosts(
  input: z.infer<typeof updatePoLineCostsSchema>,
): Promise<ActionResult<{ id: string; total: number }>> {
  const parsed = updatePoLineCostsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) };
  }

  const supabase = await createClient();
  const result = await updatePoLineCostsCore(
    supabase,
    parsed.data.id,
    parsed.data.lines,
  );

  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }

  revalidateTimelinePaths();
  revalidatePath("/purchase-orders");
  return { ok: true, data: result.data };
}
