import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  GlowToolResult,
  ProductListItem,
  RunListItem,
  RunWriteResult,
  VendorListItem,
} from "@/lib/ai/tool-results";
import {
  appendRunNotesCore,
  createRunCore,
  updateRunDatesCore,
  updateRunStageCore,
} from "@/lib/manufacturing/core";
import {
  createProductCore,
  createProductInput,
  deactivateProductCore,
} from "@/lib/products/core";
import { createVendorCore, createVendorInput } from "@/lib/vendors/core";
import type { ManufacturingStage } from "@/lib/manufacturing/stages";
import type { Database } from "@/types/db";

type Client = SupabaseClient<Database>;

export type GlowToolCtx = {
  supabase: Client;
  /** null for in-app chat (RLS via cookie); set for Slack service-role writes. */
  actorUserId: string | null;
  source: "chat" | "slack";
};

const stageSchema = z.enum([
  "ordered",
  "in_production",
  "complete",
  "in_transit",
  "received",
]);

function toolError(code: string, message: string): GlowToolResult<never> {
  return { ok: false, error: { code, message } };
}

async function runTool<T>(
  fn: () => Promise<GlowToolResult<T>>,
): Promise<GlowToolResult<T>> {
  try {
    return await fn();
  } catch (err) {
    return toolError(
      "UNEXPECTED",
      err instanceof Error ? err.message : "Unexpected tool error",
    );
  }
}

function scoreVendorName(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.includes(q)) return 60;
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits = tokens.filter((t) => n.includes(t)).length;
  return hits > 0 ? 40 + hits * 10 : 0;
}

function scoreProductName(name: string, query: string): number {
  return scoreVendorName(name, query);
}

async function fetchRunSummary(
  supabase: Client,
  id: string,
): Promise<GlowToolResult<RunWriteResult>> {
  const { data, error } = await supabase
    .from("manufacturing_runs")
    .select(
      `id, product_id, product_name, quantity, stage, expected_arrival_date,
       expected_completion_date, actual_arrival_date, actual_completion_date,
       vendors!inner ( name ),
       products ( sku )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return toolError(error.code ?? "DB_ERROR", error.message);
  }
  if (!data) {
    return toolError("NOT_FOUND", "Manufacturing run not found");
  }

  const product = data.products as { sku: string | null } | null;

  return {
    ok: true,
    data: {
      id: data.id,
      product_id: data.product_id,
      product_name: data.product_name,
      product_sku: product?.sku ?? null,
      quantity: data.quantity,
      stage: data.stage,
      vendor_name: (data.vendors as { name: string }).name,
      expected_arrival_date: data.expected_arrival_date,
      expected_completion_date: data.expected_completion_date,
      actual_arrival_date: data.actual_arrival_date,
      actual_completion_date: data.actual_completion_date,
    },
  };
}

export function makeGlowTools(ctx: GlowToolCtx) {
  const { supabase, actorUserId } = ctx;

  return {
    listVendors: tool({
      description:
        "List vendors with id + name. Use when the user references a vendor by name and you need the id.",
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe("Optional case-insensitive substring filter."),
      }),
      execute: async ({ nameContains }) =>
        runTool(async () => {
          const { data, error } = await supabase
            .from("vendors")
            .select("id, name")
            .order("name", { ascending: true })
            .limit(200);

          if (error) {
            return toolError(error.code ?? "DB_ERROR", error.message);
          }

          let vendors: VendorListItem[] = data ?? [];

          if (nameContains?.trim()) {
            const query = nameContains.trim();
            const direct = vendors.filter((v) =>
              v.name.toLowerCase().includes(query.toLowerCase()),
            );

            if (direct.length > 0) {
              vendors = direct;
            } else {
              vendors = [...vendors]
                .map((v) => ({ v, score: scoreVendorName(v.name, query) }))
                .filter(({ score }) => score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(({ v }) => v);
            }
          }

          return {
            ok: true,
            data: {
              vendors,
              count: vendors.length,
              nearestMatches: Boolean(nameContains?.trim() && vendors.length > 0),
            },
          };
        }),
    }),

    listProducts: tool({
      description:
        "List catalog products with id, name, SKU, and category. Use to disambiguate product names, validate SKUs, or resolve product_id before creating a manufacturing run.",
      inputSchema: z.object({
        nameContains: z
          .string()
          .optional()
          .describe("Optional case-insensitive substring filter on product name."),
        sku: z
          .string()
          .optional()
          .describe("Optional case-insensitive SKU filter."),
        includeInactive: z.boolean().default(false),
      }),
      execute: async ({ nameContains, sku, includeInactive }) =>
        runTool(async () => {
          let query = supabase
            .from("products")
            .select("id, name, sku, category, active")
            .order("name", { ascending: true })
            .limit(200);

          if (!includeInactive) {
            query = query.eq("active", true);
          }

          const { data, error } = await query;
          if (error) {
            return toolError(error.code ?? "DB_ERROR", error.message);
          }

          let products: ProductListItem[] = data ?? [];

          if (sku?.trim()) {
            const q = sku.trim().toLowerCase();
            products = products.filter((p) =>
              p.sku?.toLowerCase().includes(q),
            );
          }

          if (nameContains?.trim()) {
            const queryText = nameContains.trim();
            const direct = products.filter((p) =>
              p.name.toLowerCase().includes(queryText.toLowerCase()),
            );

            if (direct.length > 0) {
              products = direct;
            } else {
              products = [...products]
                .map((p) => ({
                  p,
                  score: scoreProductName(p.name, queryText),
                }))
                .filter(({ score }) => score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map(({ p }) => p);
            }
          }

          return {
            ok: true,
            data: {
              products,
              count: products.length,
              nearestMatches: Boolean(nameContains?.trim() && products.length > 0),
            },
          };
        }),
    }),

    listManufacturingRuns: tool({
      description:
        "List manufacturing runs with vendor + product. Use to disambiguate when the user says e.g. 'the Daily Cleanser run'.",
      inputSchema: z.object({
        productContains: z.string().optional(),
        vendorContains: z.string().optional(),
        stage: stageSchema.optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ productContains, vendorContains, stage, limit }) =>
        runTool(async () => {
          let query = supabase
            .from("manufacturing_runs")
            .select(
              `id, product_id, product_name, variant, quantity, stage,
               expected_arrival_date, expected_completion_date,
               vendors!inner ( name ),
               products ( sku )`,
            )
            .order("updated_at", { ascending: false })
            .limit(limit);

          if (stage) {
            query = query.eq("stage", stage);
          }

          const { data, error } = await query;
          if (error) {
            return toolError(error.code ?? "DB_ERROR", error.message);
          }

          let runs: RunListItem[] = (data ?? []).map((row) => ({
            id: row.id,
            product_id: row.product_id,
            product_name: row.product_name,
            product_sku: (row.products as { sku: string | null } | null)?.sku ?? null,
            variant: row.variant,
            quantity: row.quantity,
            stage: row.stage,
            vendor_name: (row.vendors as { name: string }).name,
            expected_arrival_date: row.expected_arrival_date,
            expected_completion_date: row.expected_completion_date,
          }));

          if (productContains?.trim()) {
            const q = productContains.trim().toLowerCase();
            runs = runs.filter((r) => r.product_name.toLowerCase().includes(q));
          }
          if (vendorContains?.trim()) {
            const q = vendorContains.trim().toLowerCase();
            runs = runs.filter((r) => r.vendor_name.toLowerCase().includes(q));
          }

          return { ok: true, data: { runs, count: runs.length } };
        }),
    }),

    createVendor: tool({
      description:
        "Create a new vendor (manufacturer, supplier, or 3PL). Use when the user provides at minimum a vendor name. Vendor creation is low-stakes — execute immediately after restating in plain English. Do NOT require explicit user confirmation.",
      inputSchema: createVendorInput,
      execute: async (input) =>
        runTool(async () => {
          const created = await createVendorCore(
            supabase,
            actorUserId,
            input,
          );
          if (!created.ok) return created;
          return { ok: true, data: created.data };
        }),
    }),

    createProduct: tool({
      description:
        "Create a catalog product manually. Product creation is low-stakes — execute immediately after restating in plain English when the user explicitly wants a new catalog entry. Prefer the products list in DATA or listProducts first to avoid duplicates.",
      inputSchema: createProductInput,
      execute: async (input) =>
        runTool(async () => {
          const created = await createProductCore(
            supabase,
            actorUserId,
            input,
          );
          if (!created.ok) return created;
          return { ok: true, data: created.data };
        }),
    }),

    deactivateProduct: tool({
      description:
        "Soft-delete a catalog product by setting active=false. Requires explicit user confirmation before calling.",
      inputSchema: z.object({
        id: z.string().uuid(),
      }),
      execute: async ({ id }) =>
        runTool(async () => {
          const result = await deactivateProductCore(
            supabase,
            actorUserId,
            id,
          );
          if (!result.ok) return result;
          return { ok: true, data: result.data };
        }),
    }),

    createManufacturingRun: tool({
      description:
        "Create a new manufacturing run (production order). Before creating, call listProducts or use the products list in DATA to resolve the product. If a match is found, pass BOTH product_id and product_name (use the canonical product name from the catalog). If no match, ask the user whether to createProduct first or proceed with just product_name. Resolve vendor by name first via listVendors.",
      inputSchema: z.object({
        vendor_id: z.string().uuid(),
        product_id: z.string().uuid().optional(),
        product_name: z.string().min(1),
        variant: z.string().optional(),
        quantity: z.number().int().positive(),
        expected_completion_date: z.string().date().optional(),
        expected_arrival_date: z.string().date().optional(),
        notes: z.string().optional(),
      }),
      execute: async (input) =>
        runTool(async () => {
          const created = await createRunCore(supabase, actorUserId, {
            vendor_id: input.vendor_id,
            product_id: input.product_id ?? null,
            product_name: input.product_name.trim(),
            variant: input.variant?.trim() || null,
            quantity: input.quantity,
            expected_completion_date: input.expected_completion_date ?? null,
            expected_arrival_date: input.expected_arrival_date ?? null,
            notes: input.notes?.trim() || null,
            stage: "ordered",
          });

          if (!created.ok) return created;
          return fetchRunSummary(supabase, created.data.id);
        }),
    }),

    updateRunStage: tool({
      description:
        "Move a manufacturing run to a new stage. Use after confirming the run via listManufacturingRuns. Moving to 'received' also sets actual_arrival_date = today if null.",
      inputSchema: z.object({
        run_id: z.string().uuid(),
        new_stage: stageSchema,
        notes_append: z.string().optional(),
      }),
      execute: async ({ run_id, new_stage, notes_append }) =>
        runTool(async () => {
          const updated = await updateRunStageCore(
            supabase,
            actorUserId,
            run_id,
            new_stage as ManufacturingStage,
          );
          if (!updated.ok) return updated;

          if (notes_append?.trim()) {
            const notes = await appendRunNotesCore(
              supabase,
              actorUserId,
              run_id,
              notes_append,
            );
            if (!notes.ok) return notes;
          }

          return fetchRunSummary(supabase, run_id);
        }),
    }),

    updateRunArrival: tool({
      description: "Update a run's expected arrival or completion date.",
      inputSchema: z
        .object({
          run_id: z.string().uuid(),
          expected_arrival_date: z.string().date().optional(),
          expected_completion_date: z.string().date().optional(),
          notes_append: z.string().optional(),
        })
        .refine(
          (d) => Boolean(d.expected_arrival_date || d.expected_completion_date),
          "Provide at least one date",
        ),
      execute: async (input) =>
        runTool(async () => {
          const updated = await updateRunDatesCore(
            supabase,
            actorUserId,
            input.run_id,
            {
              expected_arrival_date: input.expected_arrival_date ?? null,
              expected_completion_date: input.expected_completion_date ?? null,
            },
          );
          if (!updated.ok) return updated;

          if (input.notes_append?.trim()) {
            const notes = await appendRunNotesCore(
              supabase,
              actorUserId,
              input.run_id,
              input.notes_append,
            );
            if (!notes.ok) return notes;
          }

          return fetchRunSummary(supabase, input.run_id);
        }),
    }),
  };
}

export type GlowTools = ReturnType<typeof makeGlowTools>;
