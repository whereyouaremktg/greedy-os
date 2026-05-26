"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createRunCore,
  deleteRunCore,
  updateRunCore,
  updateRunStageCore,
  type CoreResult,
  type CreateRunInput,
} from "@/lib/manufacturing/core";
import type { ManufacturingStage } from "@/lib/manufacturing/stages";
import { createClient } from "@/lib/supabase/server";

const stageSchema = z.enum([
  "ordered",
  "in_production",
  "complete",
  "in_transit",
  "received",
]);

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalDate = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
        .transform((v) => v),
    ]),
  )
  .transform((v) => (v.length > 0 ? v : null));

const optionalUuid = z
  .string()
  .transform((v) => v.trim())
  .pipe(
    z.union([z.literal(""), z.string().uuid()]).transform((v) =>
      v.length > 0 ? v : null,
    ),
  );

export const runSchema = z.object({
  vendor_id: z.string().uuid("Select a vendor"),
  purchase_order_id: optionalUuid,
  product_name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Product name is required")),
  variant: optionalText,
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity cannot be negative"),
  stage: stageSchema.default("ordered"),
  expected_completion_date: optionalDate,
  expected_arrival_date: optionalDate,
  actual_completion_date: optionalDate,
  actual_arrival_date: optionalDate,
  notes: optionalText,
});

export type RunFormValues = z.input<typeof runSchema>;

const idSchema = z.string().uuid();

function flattenZod(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

function validationError(message: string): CoreResult<never> {
  return { ok: false, error: { code: "VALIDATION_ERROR", message } };
}

async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      error: validationError("You must be signed in"),
    } as const;
  }
  return { supabase, user, error: null } as const;
}

function toCoreInput(parsed: z.output<typeof runSchema>): CreateRunInput {
  return parsed;
}

export async function createRun(
  input: RunFormValues,
): Promise<CoreResult<{ id: string }>> {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(flattenZod(parsed.error));
  }

  const auth = await getAuthedClient();
  if (auth.error) return auth.error;

  const result = await createRunCore(
    auth.supabase,
    auth.user!.id,
    toCoreInput(parsed.data),
  );
  if (result.ok) revalidatePath("/manufacturing");
  return result;
}

export async function updateRun(
  id: string,
  input: RunFormValues,
): Promise<CoreResult<{ id: string }>> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return validationError("Invalid run id");
  }

  const parsed = runSchema.safeParse(input);
  if (!parsed.success) {
    return validationError(flattenZod(parsed.error));
  }

  const auth = await getAuthedClient();
  if (auth.error) return auth.error;

  const result = await updateRunCore(
    auth.supabase,
    auth.user!.id,
    idResult.data,
    toCoreInput(parsed.data),
  );
  if (result.ok) revalidatePath("/manufacturing");
  return result;
}

export async function updateRunStage(
  id: string,
  stage: ManufacturingStage,
): Promise<
  CoreResult<{ id: string; stage: ManufacturingStage }>
> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return validationError("Invalid run id");
  }

  const stageResult = stageSchema.safeParse(stage);
  if (!stageResult.success) {
    return validationError("Invalid stage");
  }

  const auth = await getAuthedClient();
  if (auth.error) return auth.error;

  const result = await updateRunStageCore(
    auth.supabase,
    auth.user!.id,
    idResult.data,
    stageResult.data,
  );
  if (result.ok) revalidatePath("/manufacturing");
  return result;
}

export async function deleteRun(
  id: string,
): Promise<CoreResult<{ id: string }>> {
  const idResult = idSchema.safeParse(id);
  if (!idResult.success) {
    return validationError("Invalid run id");
  }

  const auth = await getAuthedClient();
  if (auth.error) return auth.error;

  const result = await deleteRunCore(
    auth.supabase,
    auth.user!.id,
    idResult.data,
  );
  if (result.ok) revalidatePath("/manufacturing");
  return result;
}
