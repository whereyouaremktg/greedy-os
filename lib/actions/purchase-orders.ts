"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { revalidateTimelinePaths } from "@/lib/timeline/revalidate";

import {
  createPurchaseOrderCore,
  fetchPurchaseOrderDetail,
} from "@/lib/purchase-orders/core";
import {
  createPurchaseOrderInputSchema,
  parsedPurchaseOrderSchema,
  parsedToCreateInput,
  type CreatePurchaseOrderInput,
} from "@/lib/purchase-orders/schema";
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
