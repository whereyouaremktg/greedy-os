export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Purchase Orders
        </h1>
        <p className="text-sm text-muted-foreground">
          Accounts payable. Vendor POs, line items, and deposit/balance
          payments. Coming in Phase 1.
        </p>
      </div>
      <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
        Phase 1.2 / 1.3 builds the PO list + detail and the AP roll-up.
      </div>
    </div>
  );
}
