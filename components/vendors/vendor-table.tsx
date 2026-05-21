"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VendorForm } from "@/components/vendors/vendor-form"
import { deleteVendor } from "@/lib/actions/vendors"

export type VendorRow = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  po_count: number
  manufacturing_count: number
}

export function VendorTable({ vendors }: { vendors: VendorRow[] }) {
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<VendorRow | null>(null)
  const [deleting, setDeleting] = React.useState<VendorRow | null>(null)
  const [deletePending, startDeleteTransition] = React.useTransition()

  function handleDelete() {
    if (!deleting) return
    const target = deleting
    startDeleteTransition(async () => {
      const result = await deleteVendor(target.id)
      if (result.ok) {
        toast.success(`Deleted ${target.name}`)
        setDeleting(null)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Manufacturers and suppliers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          New vendor
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">POs</TableHead>
              <TableHead className="text-right">Mfg runs</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No vendors yet. Click &ldquo;New vendor&rdquo; to add one.
                </TableCell>
              </TableRow>
            ) : (
              vendors.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  className="cursor-pointer"
                  onClick={() => setEditing(vendor)}
                >
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.contact_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vendor.po_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vendor.manufacturing_count}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${vendor.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleting(vendor)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>New vendor</SheetTitle>
            <SheetDescription>
              Add a manufacturer or supplier.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <VendorForm
              onSuccess={() => setCreateOpen(false)}
              onCancel={() => setCreateOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit vendor</SheetTitle>
            <SheetDescription>
              {editing?.name ?? ""}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {editing ? (
              <VendorForm
                vendor={editing}
                onSuccess={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleting(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete vendor?</DialogTitle>
            <DialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {deleting?.name}
              </span>
              . Vendors referenced by purchase orders or manufacturing runs
              cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
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
  )
}
