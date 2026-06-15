"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatUsd } from "@/lib/format";
import {
  updatePoLabels,
  updatePoLineCosts,
  updatePoShipment,
} from "@/lib/actions/purchase-orders";
import {
  formatPoStatusLabel,
  type PoStatus,
} from "@/lib/purchase-orders/statuses";

export type PoDetail = {
  id: string;
  po_number: string | null;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  ship_date: string | null;
  tracking_number: string | null;
  carrier: string | null;
  labels_ordered: boolean;
  labels_cost: number | null;
  labels_note: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
  vendor_name: string;
  payments: Array<{
    id: string;
    label: string;
    amount: number;
    due_date: string | null;
    paid: boolean;
    paid_date: string | null;
  }>;
  line_items: Array<{
    id: string;
    product_name: string;
    sku: string | null;
    style_number: string | null;
    color: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number | null;
    retail_price: number | null;
    cancel_date: string | null;
  }>;
};

type Props = {
  detail: PoDetail | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ShipmentForm({
  detail,
  onSaved,
}: {
  detail: PoDetail;
  onSaved?: () => void;
}) {
  const [shipDate, setShipDate] = React.useState(detail.ship_date ?? "");
  const [carrier, setCarrier] = React.useState(detail.carrier ?? "");
  const [tracking, setTracking] = React.useState(detail.tracking_number ?? "");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setShipDate(detail.ship_date ?? "");
    setCarrier(detail.carrier ?? "");
    setTracking(detail.tracking_number ?? "");
  }, [detail]);

  function handleSave() {
    startTransition(async () => {
      const result = await updatePoShipment({
        id: detail.id,
        ship_date: shipDate.trim() || null,
        carrier: carrier.trim() || null,
        tracking_number: tracking.trim() || null,
      });

      if (result.ok) {
        toast.success("Shipment updated");
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-medium">Shipment</h3>
        <p className="text-xs text-muted-foreground">
          Carrier, tracking, and ship date for this PO.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="po-carrier">Carrier</Label>
          <Input
            id="po-carrier"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="UPS, FedEx…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-ship-date">Ship date</Label>
          <Input
            id="po-ship-date"
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="po-tracking">Tracking number</Label>
          <Input
            id="po-tracking"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder="1Z999…"
          />
        </div>
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>
        {pending ? "Saving…" : "Save shipment"}
      </Button>
    </div>
  );
}

function LabelsForm({
  detail,
  onSaved,
}: {
  detail: PoDetail;
  onSaved?: () => void;
}) {
  const [ordered, setOrdered] = React.useState(detail.labels_ordered);
  const [cost, setCost] = React.useState(
    detail.labels_cost != null ? String(detail.labels_cost) : "",
  );
  const [note, setNote] = React.useState(detail.labels_note ?? "");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setOrdered(detail.labels_ordered);
    setCost(detail.labels_cost != null ? String(detail.labels_cost) : "");
    setNote(detail.labels_note ?? "");
  }, [detail]);

  function handleSave() {
    const trimmedCost = cost.trim();
    const parsedCost = trimmedCost === "" ? null : Number(trimmedCost);
    if (parsedCost != null && !Number.isFinite(parsedCost)) {
      toast.error("Label cost must be a number");
      return;
    }
    startTransition(async () => {
      const result = await updatePoLabels({
        id: detail.id,
        labels_ordered: ordered,
        labels_cost: parsedCost,
        labels_note: note.trim() || null,
      });
      if (result.ok) {
        toast.success("Labels updated");
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-medium">Labels</h3>
        <p className="text-xs text-muted-foreground">
          Compliance labels purchased from the retailer&apos;s supplier (e.g.
          Anthropologie) before shipping.
        </p>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="po-labels-ordered">Labels ordered</Label>
        <Switch
          id="po-labels-ordered"
          checked={ordered}
          onCheckedChange={setOrdered}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="po-labels-cost">Label cost</Label>
          <Input
            id="po-labels-cost"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-labels-note">Supplier / reference</Label>
          <Input
            id="po-labels-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Supplier, order #…"
          />
        </div>
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>
        {pending ? "Saving…" : "Save labels"}
      </Button>
    </div>
  );
}

function CostsForm({
  detail,
  onSaved,
}: {
  detail: PoDetail;
  onSaved?: () => void;
}) {
  const [costs, setCosts] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setCosts(
      Object.fromEntries(
        detail.line_items.map((li) => [li.id, String(li.unit_cost)]),
      ),
    );
  }, [detail]);

  const previewTotal = detail.line_items.reduce((sum, li) => {
    const raw = costs[li.id];
    const cost = raw === "" || raw == null ? 0 : Number(raw);
    return sum + li.quantity * (Number.isFinite(cost) ? cost : 0);
  }, 0);

  function handleSave() {
    const lines = detail.line_items.map((li) => {
      const raw = costs[li.id];
      const cost = raw === "" || raw == null ? 0 : Number(raw);
      return { id: li.id, unit_cost: Number.isFinite(cost) ? cost : 0 };
    });
    startTransition(async () => {
      const result = await updatePoLineCosts({ id: detail.id, lines });
      if (result.ok) {
        toast.success("Costs updated");
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-medium">Edit unit costs</h3>
        <p className="text-xs text-muted-foreground">
          Fill in per-unit costs (e.g. on an uploaded PO) — the total recomputes
          automatically.
        </p>
      </div>
      <div className="space-y-2">
        {detail.line_items.map((li) => (
          <div key={li.id} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {li.product_name}
              </div>
              <div className="text-xs text-muted-foreground num">
                {li.quantity.toLocaleString()} units
                {li.sku ? ` · ${li.sku}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="h-8 w-24"
                value={costs[li.id] ?? ""}
                onChange={(e) =>
                  setCosts((prev) => ({ ...prev, [li.id]: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">New total</span>
        <span className="num text-sm font-medium">
          {formatUsd(previewTotal, 2)}
        </span>
      </div>
      <Button size="sm" onClick={handleSave} disabled={pending}>
        {pending ? "Saving…" : "Save costs"}
      </Button>
    </div>
  );
}

export function PoDetailSheet({
  detail,
  loading,
  error,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const totalUnits =
    detail?.line_items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {detail?.po_number ? `PO ${detail.po_number}` : "Purchase order"}
          </SheetTitle>
          <SheetDescription>
            {detail?.vendor_name ?? "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="mt-6 text-sm text-destructive">{error}</p>
        ) : detail ? (
          <div className="mt-6 space-y-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{formatPoStatusLabel(detail.status as PoStatus)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Order date</dt>
                <dd>{formatDate(detail.order_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Latest cancel</dt>
                <dd className="text-destructive">
                  {formatDate(detail.expected_date)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="num font-medium">
                  {formatUsd(detail.total, 2)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Units</dt>
                <dd className="num">{totalUnits.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Styles</dt>
                <dd className="num">{detail.line_items.length}</dd>
              </div>
            </dl>

            <ShipmentForm detail={detail} onSaved={onSaved} />

            <LabelsForm detail={detail} onSaved={onSaved} />

            {detail.payments.length > 0 ? (
              <div className="rounded-md border">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-medium">Payments</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="capitalize">
                          {payment.label.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>{formatDate(payment.due_date)}</TableCell>
                        <TableCell className="text-right num">
                          {formatUsd(payment.amount, 2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {payment.paid ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Paid
                            </span>
                          ) : (
                            <span className="text-warning-foreground">
                              Due
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            {detail.notes ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {detail.notes}
              </div>
            ) : null}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Cancel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.line_items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[item.sku, item.color].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right num">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right num">
                        {formatUsd(item.unit_cost, 2)}
                      </TableCell>
                      <TableCell className="text-right num text-destructive">
                        {formatDate(item.cancel_date)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {detail.line_items.length > 0 ? (
              <CostsForm detail={detail} onSaved={onSaved} />
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
