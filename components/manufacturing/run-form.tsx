"use client";

import * as React from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  createRun,
  updateRun,
  deleteRun,
} from "@/lib/actions/manufacturing";
import {
  runFormSchema,
  type RunFormValues,
} from "@/lib/manufacturing/run-schema";
import {
  MANUFACTURING_STAGES,
  formatStageLabel,
} from "@/lib/manufacturing/stages";
import type {
  ManufacturingRunRow,
  ProductOption,
  PurchaseOrderOption,
  VendorOption,
} from "@/components/manufacturing/types";
import { ProductCombobox } from "@/components/products/product-combobox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function toFormValues(run?: ManufacturingRunRow): RunFormValues {
  return {
    vendor_id: run?.vendor_id ?? "",
    purchase_order_id: run?.purchase_order_id ?? "",
    product_id: run?.product_id ?? "",
    product_name: run?.product_name ?? "",
    variant: run?.variant ?? "",
    quantity: run?.quantity ?? 0,
    stage: run?.stage ?? "ordered",
    expected_completion_date: run?.expected_completion_date ?? "",
    expected_arrival_date: run?.expected_arrival_date ?? "",
    actual_completion_date: run?.actual_completion_date ?? "",
    actual_arrival_date: run?.actual_arrival_date ?? "",
    notes: run?.notes ?? "",
  };
}

const formId = "manufacturing-run-form";

export function RunForm({
  run,
  vendors,
  purchaseOrders,
  products,
  onSuccess,
  onCancel,
  onDeleted,
}: {
  run?: ManufacturingRunRow;
  vendors: VendorOption[];
  purchaseOrders: PurchaseOrderOption[];
  products: ProductOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePending, setDeletePending] = React.useState(false);
  const isEdit = !!run;
  const hasPurchaseOrders = purchaseOrders.length > 0;

  const form = useForm<RunFormValues>({
    resolver: zodResolver(runFormSchema),
    defaultValues: toFormValues(run),
  });

  React.useEffect(() => {
    if (isEdit || vendors.length !== 1) return;
    if (!form.getValues("vendor_id")) {
      form.setValue("vendor_id", vendors[0]!.id, { shouldValidate: true });
    }
  }, [form, isEdit, vendors]);

  function showValidationToast(errors: FieldErrors<RunFormValues>) {
    const messages = Object.entries(errors)
      .map(([key, err]) => {
        const msg = err?.message;
        return msg ? `${key}: ${String(msg)}` : null;
      })
      .filter(Boolean);
    toast.error(
      messages[0] ?? "Fix the highlighted fields to continue.",
    );
    const firstKey = Object.keys(errors)[0] as keyof RunFormValues | undefined;
    if (firstKey) form.setFocus(firstKey);
  }

  async function onSubmit(values: RunFormValues) {
    setSubmitting(true);
    const toastId = toast.loading(isEdit ? "Saving run…" : "Creating run…");
    try {
      const result = isEdit
        ? await updateRun(run.id, values)
        : await createRun(values);

      if (result.ok) {
        toast.success(isEdit ? "Run updated" : "Run created", { id: toastId });
        onSuccess?.();
      } else {
        toast.error(result.error.message, { id: toastId });
      }
    } catch {
      toast.error("Something went wrong. Try again.", { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  const submitRun = form.handleSubmit(onSubmit, showValidationToast);

  async function handleDelete() {
    if (!run) return;
    setDeletePending(true);
    const toastId = toast.loading("Deleting run…");
    try {
      const result = await deleteRun(run.id);
      if (result.ok) {
        toast.success(`Deleted ${run.product_name}`, { id: toastId });
        setDeleteOpen(false);
        onDeleted?.();
        onSuccess?.();
      } else {
        toast.error(result.error.message, { id: toastId });
      }
    } catch {
      toast.error("Something went wrong. Try again.", { id: toastId });
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <>
      <Form {...form}>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            void submitRun();
          }}
          className="flex flex-col gap-4"
          aria-busy={submitting}
          noValidate
        >
          {Object.keys(form.formState.errors).length > 0 ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {Object.entries(form.formState.errors).map(([key, err]) =>
                err?.message ? (
                  <p key={key}>{String(err.message)}</p>
                ) : null,
              )}
            </div>
          ) : null}
          <FormField
            control={form.control}
            name="vendor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor</FormLabel>
                <FormControl>
                  <Select {...field} value={field.value ?? ""}>
                    <option value="" disabled>
                      Select vendor
                    </option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="purchase_order_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Purchase order</FormLabel>
                <FormControl>
                  <Select
                    {...field}
                    value={field.value ?? ""}
                    disabled={!hasPurchaseOrders}
                  >
                    <option value="">None</option>
                    {purchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.po_number ?? `PO ${po.id.slice(0, 8)}`}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                {!hasPurchaseOrders ? (
                  <FormDescription>
                    No POs yet — link later when PO module ships.
                  </FormDescription>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="product_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catalog product (optional)</FormLabel>
                <FormControl>
                  <ProductCombobox
                    products={products}
                    value={field.value?.trim() ? field.value : null}
                    onChange={(productId, productName) => {
                      field.onChange(productId ?? "");
                      if (productName) {
                        form.setValue("product_name", productName, {
                          shouldValidate: true,
                        });
                      }
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Link to the catalog, or choose None to enter a free-text name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="product_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product name (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="Silk Press Serum — or leave blank" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="variant"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Variant (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="8 oz" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="num"
                    {...field}
                    value={Number.isFinite(Number(field.value))
                      ? Number(field.value)
                      : 0}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        field.onChange(0);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isFinite(n) ? n : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage</FormLabel>
                <FormControl>
                  <Select {...field} value={field.value ?? "ordered"}>
                    {MANUFACTURING_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {formatStageLabel(stage)}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-xs text-muted-foreground">
            Timeline and notes are optional — add them when you have them.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="expected_completion_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected completion (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expected_arrival_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected arrival (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="actual_completion_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual completion (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="actual_arrival_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Actual arrival (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="MO notes, QC flags…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="sticky bottom-0 -mx-4 mt-2 border-t bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {isEdit ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={submitting || deletePending}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                {onCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitRun()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      {isEdit ? "Saving…" : "Creating…"}
                    </>
                  ) : isEdit ? (
                    "Save changes"
                  ) : (
                    "Create run"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete run?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {run?.product_name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
