import { createClient } from "@/lib/supabase/server"
import {
  VendorTable,
  type VendorRow,
} from "@/components/vendors/vendor-table"

export default async function VendorsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("vendors")
    .select(
      `id, name, contact_name, email, phone, notes,
       purchase_orders(count),
       manufacturing_runs(count)`,
    )
    .order("name", { ascending: true })

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load vendors: {error.message}
        </div>
      </div>
    )
  }

  const vendors: VendorRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    po_count: row.purchase_orders?.[0]?.count ?? 0,
    manufacturing_count: row.manufacturing_runs?.[0]?.count ?? 0,
  }))

  return (
    <div className="space-y-6">
      <VendorTable vendors={vendors} />
    </div>
  )
}
