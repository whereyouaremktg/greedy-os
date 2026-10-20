"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { saveWholesalePo, type WholesalePoInput } from "@/lib/actions/targets-wholesale";
import { PO_STATUS_LABELS, type PoStatus } from "@/lib/purchase-orders/statuses";
import type { WholesalePo, WholesaleSummary } from "@/lib/targets/wholesale";
import { Field, MoneyInput, NativeSelect } from "@/components/targets/field";
import { SectionHeading } from "@/components/targets/revenue-sections";
import { dayLabel, usd } from "@/components/targets/format";

const STATUS_ORDER: PoStatus[] = [
  "confirmed",
  "in_fulfillment",
  "shipped",
  "partially_received",
  "received",
  "closed",
  "draft",
  "cancelled",
];

function bucketBadge(b: WholesalePo["bucket"]) {
  switch (b) {
    case "paid":
      return <Badge variant="outline" className="border-success/50 text-success">Paid · counted</Badge>;
    case "invoiced":
      return <Badge variant="outline" className="border-brand/50 text-brand">Invoiced · counted</Badge>;
    case "booked":
      return <Badge variant="outline" className="text-muted-foreground">Booked</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground/60">—</Badge>;
  }
}

export function WholesaleTracker({ summary }: { summary: WholesaleSummary }) {
  const [editing, setEditing] = useState<WholesalePo | null | "new">(null);

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Wholesale"
        note="Counts toward Q4 when invoiced (invoice date in the quarter). Booked POs show separately."
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile title="Invoiced in Q4" rawValue={summary.invoicedQ4} format="usd" sub="Counted in the Q4 total" />
        <KpiTile
          title="Booked, not invoiced"
          rawValue={summary.bookedNotInvoiced}
          format="usd"
          sub="Open POs shipping in Q4 with no invoice date"
        />
        <KpiTile title="Paid in Q4" rawValue={summary.paidQ4} format="usd" sub="Invoiced and paid this quarter" />
        <Card size="sm" className="justify-center px-3">
          <div className="text-[13px] font-medium text-muted-foreground">Partners without a Q4 PO</div>
          <div className="mt-1 text-sm">
            {summary.partnersWithoutPos.length > 0 ? summary.partnersWithoutPos.join(", ") : "All plan partners have a PO"}
          </div>
          <Button size="sm" className="mt-3 w-fit" onClick={() => setEditing("new")}>
            <Plus />
            Add PO
          </Button>
        </Card>
      </div>

      <Card size="sm" className="py-0">
        {summary.pos.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No wholesale POs yet. Add one, or forward the PO email to the inbound address and it lands here.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>PO #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Ship</TableHead>
                <TableHead className="hidden md:table-cell">Invoiced</TableHead>
                <TableHead className="hidden lg:table-cell">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Q4</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.pos.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer", p.bucket === "excluded" && "text-muted-foreground")}
                  onClick={() => setEditing(p)}
                >
                  <TableCell className="font-medium">{p.partner}</TableCell>
                  <TableCell className="num">{p.poNumber ?? "—"}</TableCell>
                  <TableCell className="num text-right">
                    {usd(p.total)}
                    {p.invoicedAmount != null && p.invoicedAmount !== p.total ? (
                      <div className="text-[10px] text-muted-foreground">inv {usd(p.invoicedAmount)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell num">{p.shipDate ? dayLabel(p.shipDate) : p.cancelDate ? `by ${dayLabel(p.cancelDate)}` : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell num">{p.invoiceDate ? dayLabel(p.invoiceDate) : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell num">{p.paidDate ? dayLabel(p.paidDate) : "—"}</TableCell>
                  <TableCell>{PO_STATUS_LABELS[p.status] ?? p.status}</TableCell>
                  <TableCell>{bucketBadge(p.bucket)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <WholesalePoDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        po={editing === "new" ? null : editing}
        partners={summary.partners.map((p) => p.name)}
      />
    </section>
  );
}

function toInput(po: WholesalePo | null): WholesalePoInput {
  return {
    id: po?.id,
    partner_name: po?.partner ?? "",
    po_number: po?.poNumber ?? "",
    total: po?.total ?? 0,
    status: po?.status ?? "confirmed",
    order_date: po?.orderDate ?? null,
    ship_date: po?.shipDate ?? null,
    expected_date: po?.cancelDate ?? null,
    invoice_date: po?.invoiceDate ?? null,
    invoice_number: po?.invoiceNumber ?? "",
    invoiced_amount: po?.invoicedAmount ?? null,
    paid_date: po?.paidDate ?? null,
    notes: po?.notes ?? "",
  };
}

function WholesalePoDialog({
  open,
  onOpenChange,
  po,
  partners,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: WholesalePo | null;
  partners: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{po ? `${po.partner} · PO ${po.poNumber ?? ""}` : "New wholesale PO"}</DialogTitle>
          <DialogDescription>
            Invoice date decides when it counts toward Q4. Leave it blank while the PO is only booked.
          </DialogDescription>
        </DialogHeader>
        {open ? <WholesalePoForm key={po?.id ?? "new"} initial={toInput(po)} partners={partners} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function WholesalePoForm({
  initial,
  partners,
  onDone,
}: {
  initial: WholesalePoInput;
  partners: string[];
  onDone: () => void;
}) {
  const [form, setForm] = useState<WholesalePoInput>(initial);
  const [pending, start] = useTransition();
  const set = <K extends keyof WholesalePoInput>(k: K, v: WholesalePoInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dateVal = (v: string | null | undefined) => v ?? "";
  const dateSet = (k: "order_date" | "ship_date" | "expected_date" | "invoice_date" | "paid_date") => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, e.target.value || null);

  const save = () =>
    start(async () => {
      const res = await saveWholesalePo({
        ...form,
        po_number: form.po_number?.trim() || null,
        invoice_number: form.invoice_number?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      if (res.ok) {
        toast.success(form.id ? "PO updated" : "PO added");
        onDone();
      } else {
        toast.error(res.error);
      }
    });

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="wp-partner" label="Partner" className="col-span-2">
          <Input
            id="wp-partner"
            list="wp-partners"
            value={form.partner_name}
            onChange={(e) => set("partner_name", e.target.value)}
            placeholder="REVOLVE, ANTHROPOLOGIE, URBAN OUTFITTERS, NORDSTROM, TARGET…"
          />
          <datalist id="wp-partners">
            {partners.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field id="wp-number" label="PO number">
          <Input id="wp-number" value={form.po_number ?? ""} onChange={(e) => set("po_number", e.target.value)} />
        </Field>
        <Field id="wp-total" label="PO amount $">
          <MoneyInput id="wp-total" value={form.total} onChange={(v) => set("total", v ?? 0)} step="0.01" />
        </Field>
        <Field id="wp-status" label="Status">
          <NativeSelect id="wp-status" value={form.status} onChange={(e) => set("status", e.target.value as PoStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {PO_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="wp-order" label="Order date">
          <Input id="wp-order" type="date" value={dateVal(form.order_date)} onChange={dateSet("order_date")} />
        </Field>
        <Field id="wp-ship" label="Ship date">
          <Input id="wp-ship" type="date" value={dateVal(form.ship_date)} onChange={dateSet("ship_date")} />
        </Field>
        <Field id="wp-cancel" label="Cancel / must-ship-by">
          <Input id="wp-cancel" type="date" value={dateVal(form.expected_date)} onChange={dateSet("expected_date")} />
        </Field>
        <Field id="wp-invdate" label="Invoice date" hint="Sets when the PO counts toward Q4.">
          <Input id="wp-invdate" type="date" value={dateVal(form.invoice_date)} onChange={dateSet("invoice_date")} />
        </Field>
        <Field id="wp-invno" label="Invoice number">
          <Input id="wp-invno" value={form.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value)} />
        </Field>
        <Field id="wp-invamt" label="Invoiced amount $" hint="Blank = full PO amount.">
          <MoneyInput id="wp-invamt" value={form.invoiced_amount ?? null} onChange={(v) => set("invoiced_amount", v)} step="0.01" />
        </Field>
        <Field id="wp-paid" label="Paid date">
          <Input id="wp-paid" type="date" value={dateVal(form.paid_date)} onChange={dateSet("paid_date")} />
        </Field>
        <Field id="wp-notes" label="Notes" className="col-span-2">
          <Textarea id="wp-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !form.partner_name.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
