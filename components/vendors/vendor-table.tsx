"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
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
import { EmptyState, EmptyStateAction } from "@/components/empty-state"
import { PageHeader } from "@/components/nav/page-header"

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

export function VendorTable({
  vendors,
  initialCreateOpen = false,
}: {
  vendors: VendorRow[]
  initialCreateOpen?: boolean
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [createOpen, setCreateOpen] = React.useState(initialCreateOpen)
  const [editing, setEditing] = React.useState<VendorRow | null>(null)
  const [deleting, setDeleting] = React.useState<VendorRow | null>(null)
  const [deletePending, startDeleteTransition] = React.useTransition()

  const openCreateFromQuery = searchParams.get("new") === "1"
  const createSheetOpen = createOpen || openCreateFromQuery

  function handleCreateOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open && openCreateFromQuery) {
      router.replace("/vendors")
    }
  }

  function closeCreateSheet() {
    handleCreateOpenChange(false)
  }

  function handleDelete() {
    if (!deleting) return
    const target = deleting
    startDeleteTransition(async () => {
      const result = await deleteVendor(target.id)
      if (result.ok) {
        toast.success(`Deleted ${target.name}`)
        setDeleting(null)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleMutationSuccess(closeSheet: () => void) {
    closeSheet()
    router.refresh()
  }

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Manufacturers and suppliers."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            New vendor
          </Button>
        }
      />

      <div className="rounded-md border">
        {vendors.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            description="Add manufacturers and suppliers to link purchase orders and production runs."
            action={
              <EmptyStateAction onClick={() => setCreateOpen(true)}>
                New vendor
              </EmptyStateAction>
            }
          />
        ) : (
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
            {vendors.map((vendor) => (
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
            ))}
          </TableBody>
        </Table>
        )}
      </div>

      <Sheet open={createSheetOpen} onOpenChange={handleCreateOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>New vendor</SheetTitle>
            <SheetDescription>
              Add a manufacturer or supplier.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <VendorForm
              onSuccess={() => handleMutationSuccess(closeCreateSheet)}
              onCancel={closeCreateSheet}
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
                onSuccess={() => handleMutationSuccess(() => setEditing(null))}
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
