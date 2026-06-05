"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createVendorCore } from "@/lib/vendors/core"
import {
  vendorSchema,
  type VendorFormValues,
} from "@/lib/vendors/form-schema"

export type ActionResult = { ok: true } | { ok: false; error: string }

const idSchema = z.string().uuid()

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ")
}

function describeError(
  err: { code?: string | null; message?: string | null } | null | undefined,
  fallback: string,
): string {
  if (!err) return fallback
  if (err.code === "23503") {
    return "This vendor is referenced by a purchase order or manufacturing run and cannot be deleted."
  }
  return err.message ?? fallback
}

export async function createVendor(
  input: VendorFormValues,
): Promise<ActionResult> {
  const parsed = vendorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const created = await createVendorCore(supabase, user?.id ?? null, {
    name: parsed.data.name,
    contact_name: parsed.data.contact_name ?? undefined,
    email: parsed.data.email ?? undefined,
    phone: parsed.data.phone ?? undefined,
    notes: parsed.data.notes ?? undefined,
  })

  if (!created.ok) {
    return { ok: false, error: created.error.message }
  }

  revalidatePath("/vendors")
  return { ok: true }
}

export async function updateVendor(
  id: string,
  input: VendorFormValues,
): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id)
  if (!idResult.success) {
    return { ok: false, error: "Invalid vendor id" }
  }

  const parsed = vendorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: flattenZod(parsed.error) }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("vendors")
    .update(parsed.data)
    .eq("id", idResult.data)

  if (error) {
    return { ok: false, error: describeError(error, "Failed to update vendor") }
  }

  revalidatePath("/vendors")
  return { ok: true }
}

export async function deleteVendor(id: string): Promise<ActionResult> {
  const idResult = idSchema.safeParse(id)
  if (!idResult.success) {
    return { ok: false, error: "Invalid vendor id" }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", idResult.data)

  if (error) {
    return { ok: false, error: describeError(error, "Failed to delete vendor") }
  }

  revalidatePath("/vendors")
  return { ok: true }
}
