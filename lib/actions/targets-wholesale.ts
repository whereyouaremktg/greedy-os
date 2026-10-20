"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateVendorByName } from "@/lib/vendors/lookup";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const optDate = isoDate.nullable().optional();

export const wholesalePoInputSchema = z.object({
  id: z.string().uuid().optional(),
  partner_name: z.string().min(1).max(200),
  po_number: z.string().max(100).nullable().optional(),
  total: z.number().nonnegative(),
  status: z.enum([
    "draft",
    "sent",
    "confirmed",
    "in_fulfillment",
    "shipped",
    "partially_received",
    "received",
    "closed",
    "cancelled",
  ]),
  order_date: optDate,
  ship_date: optDate,
  expected_date: optDate,
  invoice_date: optDate,
  invoice_number: z.string().max(100).nullable().optional(),
  invoiced_amount: z.number().nonnegative().nullable().optional(),
  paid_date: optDate,
  notes: z.string().max(2000).nullable().optional(),
});

export type WholesalePoInput = z.infer<typeof wholesalePoInputSchema>;

/** Create or update a wholesale buyer PO (a purchase_orders row). */
export async function saveWholesalePo(input: WholesalePoInput): Promise<ActionResult<{ id: string }>> {
  const parsed = wholesalePoInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const vendor = await findOrCreateVendorByName(supabase, user.id, parsed.data.partner_name);
  if (!vendor.ok) return { ok: false, error: vendor.error.message };

  const { id, partner_name: _partner, ...rest } = parsed.data;
  void _partner;
  const row = {
    vendor_id: vendor.data.id,
    po_number: rest.po_number ?? null,
    total: rest.total,
    subtotal: rest.total,
    status: rest.status,
    order_date: rest.order_date ?? null,
    ship_date: rest.ship_date ?? null,
    expected_date: rest.expected_date ?? null,
    invoice_date: rest.invoice_date ?? null,
    invoice_number: rest.invoice_number ?? null,
    invoiced_amount: rest.invoiced_amount ?? null,
    paid_date: rest.paid_date ?? null,
    notes: rest.notes ?? null,
  };

  if (id) {
    const { error } = await supabase.from("purchase_orders").update(row).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/targets");
    revalidatePath("/purchase-orders");
    return { ok: true, data: { id } };
  }
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({ ...row, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/targets");
  revalidatePath("/purchase-orders");
  return { ok: true, data: { id: data.id } };
}
