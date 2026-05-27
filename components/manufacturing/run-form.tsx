"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";

import {
  createRun,
  updateRun,
  deleteRun,
  runSchema,
  type RunFormValues,
} from "@/lib/actions/manufacturing";
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

const resolver = standardSchemaResolver(
  runSchema,
) as unknown as Resolver<RunFormValues>;

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
  const [pending, startTransition] = React.useTransition();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePending, startDeleteTransition] = React.useTransition();
  const isEdit = !!run;
  const hasPurchaseOrders = purchaseOrders.length > 0;

  const form = useForm<RunFormValues>({
    resolver,
    defaultValues: toFormValues(run),
  });

  function onSubmit(values: RunFormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateRun(run.id, values)
        : await createRun(values);

      if (result.ok) {
        toast.success(isEdit ? "Run updated" : "Run created");
        onSuccess?.();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete() {
    if (!run) return;
    startDeleteTransition(async () => {
      const result = await deleteRun(run.id);
      if (result.ok) {
        toast.success(`Deleted ${run.product_name}`);
        setDeleteOpen(false);
        onDeleted?.();
        onSuccess?.();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
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
                <FormLabel>Catalog product</FormLabel>
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
                <FormLabel>Product name</FormLabel>
                <FormControl>
                  <Input placeholder="Silk Press Serum" {...field} />
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
                <FormLabel>Variant</FormLabel>
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
                    value={Number(field.value ?? 0)}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 0 : e.target.valueAsNumber,
                      )
                    }
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

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="expected_completion_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected completion</FormLabel>
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
                  <FormLabel>Expected arrival</FormLabel>
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
                  <FormLabel>Actual completion</FormLabel>
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
                  <FormLabel>Actual arrival</FormLabel>
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
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="MO notes, QC flags…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={pending || deletePending}
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
                  disabled={pending}
                >
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save changes"
                    : "Create run"}
              </Button>
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
