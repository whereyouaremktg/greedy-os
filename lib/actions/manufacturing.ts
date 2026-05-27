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
import {
  MANUFACTURING_STAGE_VALUES,
  runSchema,
  type RunFormValues,
} from "@/lib/manufacturing/run-schema";
import type { ManufacturingStage } from "@/lib/manufacturing/stages";
import { createClient } from "@/lib/supabase/server";

export type { RunFormValues } from "@/lib/manufacturing/run-schema";

const stageSchema = z.enum(MANUFACTURING_STAGE_VALUES);

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

const UNNAMED_PRODUCT = "Unnamed product";

async function resolveProductName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string | null,
  productName: string | null,
): Promise<string> {
  if (productName) return productName;
  if (productId) {
    const { data } = await supabase
      .from("products")
      .select("name")
      .eq("id", productId)
      .maybeSingle();
    if (data?.name?.trim()) return data.name.trim();
  }
  return UNNAMED_PRODUCT;
}

async function toCoreInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: z.output<typeof runSchema>,
): Promise<CreateRunInput> {
  const product_name = await resolveProductName(
    supabase,
    parsed.product_id,
    parsed.product_name,
  );
  return { ...parsed, product_name };
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
    await toCoreInput(auth.supabase, parsed.data),
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
    await toCoreInput(auth.supabase, parsed.data),
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
