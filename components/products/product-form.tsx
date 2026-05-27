"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  createProduct,
  updateProduct,
  productSchema,
  PRODUCT_CATEGORIES,
  type ProductFormValues,
} from "@/lib/actions/products";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  active: boolean;
  image_url: string | null;
  notes: string | null;
  shopify_product_id: string | null;
  shopify_handle: string | null;
};

function toFormValues(product?: Product): ProductFormValues {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    category: product?.category ?? "",
    unit: product?.unit ?? "unit",
    image_url: product?.image_url ?? "",
    active: product?.active ?? true,
    notes: product?.notes ?? "",
  };
}

const resolver = standardSchemaResolver(
  productSchema,
) as unknown as Resolver<ProductFormValues>;

export function ProductForm({
  product,
  onSuccess,
  onCancel,
}: {
  product?: Product;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const isEdit = !!product;

  const form = useForm<ProductFormValues>({
    resolver,
    defaultValues: toFormValues(product),
  });

  function onSubmit(values: ProductFormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateProduct(product.id, values)
        : await createProduct(values);

      if (result.ok) {
        toast.success(isEdit ? "Product updated" : "Product created");
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Daily Cleanser" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU</FormLabel>
              <FormControl>
                <Input placeholder="DC-100" className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <Select {...field} value={field.value ?? ""}>
                  <option value="">Select category</option>
                  {PRODUCT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
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
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <FormControl>
                <Input placeholder="unit" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="image_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL</FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://cdn.shopify.com/..."
                  {...field}
                />
              </FormControl>
              {field.value?.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={field.value.trim()}
                  alt=""
                  className="mt-2 size-16 rounded border object-cover"
                />
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Packaging, formulation notes..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive products are hidden from pickers.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {product?.shopify_product_id ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Linked to Shopify</Badge>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              {product.shopify_product_id}
            </p>
            {product.shopify_handle ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                /{product.shopify_handle}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2 flex justify-end gap-2">
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
                : "Create product"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
