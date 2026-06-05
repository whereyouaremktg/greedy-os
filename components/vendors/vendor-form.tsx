"use client"

import * as React from "react"
import { useForm, type Resolver } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createVendor, updateVendor } from "@/lib/actions/vendors"
import { vendorSchema, type VendorFormValues } from "@/lib/vendors/form-schema"

type Vendor = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

function toFormValues(vendor?: Vendor): VendorFormValues {
  return {
    name: vendor?.name ?? "",
    contact_name: vendor?.contact_name ?? "",
    email: vendor?.email ?? "",
    phone: vendor?.phone ?? "",
    notes: vendor?.notes ?? "",
  }
}

const resolver = standardSchemaResolver(
  vendorSchema,
) as unknown as Resolver<VendorFormValues>

export function VendorForm({
  vendor,
  onSuccess,
  onCancel,
}: {
  vendor?: Vendor
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const [pending, startTransition] = React.useTransition()
  const isEdit = !!vendor

  const form = useForm<VendorFormValues>({
    resolver,
    defaultValues: toFormValues(vendor),
  })

  function onSubmit(values: VendorFormValues) {
    startTransition(async () => {
      const result = isEdit
        ? await updateVendor(vendor.id, values)
        : await createVendor(values)

      if (result.ok) {
        toast.success(isEdit ? "Vendor updated" : "Vendor created")
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    })
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
                <Input placeholder="Acme Manufacturing" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact name</FormLabel>
              <FormControl>
                <Input placeholder="Jane Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="jane@acme.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input placeholder="+1 555 0100" {...field} />
              </FormControl>
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
                  placeholder="MOQ, lead times, payment terms..."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                : "Create vendor"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
