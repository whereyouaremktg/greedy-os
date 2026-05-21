"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: true } | { ok: false; error: string }

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim()
    return trimmed.length > 0 ? trimmed : null
  })

const optionalEmail = z
  .string()
  .max(320)
  .transform((v) => v.trim())
  .pipe(
    z.union([z.literal(""), z.string().email("Invalid email")]).transform((v) =>
      v.length > 0 ? v : null,
    ),
  )

export const vendorSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Name is required")),
  contact_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  notes: optionalText,
})

export type VendorFormValues = z.input<typeof vendorSchema>

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
  const { error } = await supabase.from("vendors").insert(parsed.data)

  if (error) {
    return { ok: false, error: describeError(error, "Failed to create vendor") }
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
