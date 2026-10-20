"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { deleteLaunchDrop, saveLaunchDrop, type LaunchDropInput } from "@/lib/actions/targets-launches";
import type { LaunchDrop, LaunchesData } from "@/lib/targets/launches";
import { Field, MoneyInput } from "@/components/targets/field";
import { SectionHeading } from "@/components/targets/revenue-sections";
import { count, dayLabel, ratioPct, usd } from "@/components/targets/format";

export function LaunchTracker({ launches }: { launches: LaunchesData }) {
  const [editing, setEditing] = useState<LaunchDrop | null | "new">(null);
  const [pending, start] = useTransition();

  const remove = (d: LaunchDrop) => {
    if (!window.confirm(`Delete "${d.name}"? Sales data is not affected.`)) return;
    start(async () => {
      const res = await deleteLaunchDrop(d.id);
      if (res.ok) toast.success("Drop removed");
      else toast.error(res.error);
    });
  };

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Launch tracker · brush drops"
        note="Units, revenue and sell-through per drop from the drop date on, paid orders only."
      />
      <Card size="sm" className="py-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">Drop dates and planned units are manual; sales come from Shopify.</span>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus />
            Add drop
          </Button>
        </div>
        {launches.drops.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No drops yet. Add each November brush drop with its date, planned units and SKUs.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drop</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="min-w-[140px]">Sell-through</TableHead>
                <TableHead className="text-right hidden md:table-cell">Revenue</TableHead>
                <TableHead className="text-right hidden md:table-cell">Days to sell out</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {launches.drops.map((d) => (
                <TableRow key={d.id} className={cn("cursor-pointer", d.isUpcoming && "text-muted-foreground")} onClick={() => setEditing(d)}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-[10px] text-muted-foreground num">{d.skus.join(", ") || "no SKUs"}</div>
                  </TableCell>
                  <TableCell className="num">
                    {dayLabel(d.dropDate)}
                    {d.isUpcoming ? <Badge variant="outline" className="ml-2 text-[10px]">upcoming</Badge> : null}
                  </TableCell>
                  <TableCell className="num text-right">{d.plannedUnits != null ? count(d.plannedUnits) : "—"}</TableCell>
                  <TableCell className="num text-right">{d.isUpcoming ? "—" : count(d.unitsSold)}</TableCell>
                  <TableCell>
                    {d.sellThrough != null && !d.isUpcoming ? (
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 flex-1 rounded-full bg-muted">
                          <div
                            className={cn("absolute inset-y-0 left-0 rounded-full", d.sellThrough >= 1 ? "bg-success" : "bg-brand")}
                            style={{ width: `${Math.min(100, d.sellThrough * 100)}%` }}
                          />
                        </div>
                        <span className="num text-xs">{ratioPct(d.sellThrough, 0)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{d.isUpcoming ? "—" : "no plan"}</span>
                    )}
                  </TableCell>
                  <TableCell className="num text-right hidden md:table-cell">{d.isUpcoming ? "—" : usd(d.revenue)}</TableCell>
                  <TableCell className="num text-right hidden md:table-cell">
                    {d.daysToSellOut != null ? `${d.daysToSellOut}d` : d.isUpcoming ? "—" : `${d.daysSinceDrop}d in`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${d.name}`}
                      disabled={pending}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(d);
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
      </Card>

      <LaunchDropDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        drop={editing === "new" ? null : editing}
        knownSkus={launches.knownSkus}
      />
    </section>
  );
}

function LaunchDropDialog({
  open,
  onOpenChange,
  drop,
  knownSkus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drop: LaunchDrop | null;
  knownSkus: LaunchesData["knownSkus"];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{drop ? drop.name : "New drop"}</DialogTitle>
          <DialogDescription>Sell-through counts paid orders for these SKUs from the drop date on.</DialogDescription>
        </DialogHeader>
        {open ? <LaunchDropForm key={drop?.id ?? "new"} drop={drop} knownSkus={knownSkus} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function LaunchDropForm({
  drop,
  knownSkus,
  onDone,
}: {
  drop: LaunchDrop | null;
  knownSkus: LaunchesData["knownSkus"];
  onDone: () => void;
}) {
  const [form, setForm] = useState<LaunchDropInput>({
    id: drop?.id,
    name: drop?.name ?? "",
    drop_date: drop?.dropDate ?? "",
    planned_units: drop?.plannedUnits ?? null,
    skus: drop?.skus ?? [],
    notes: drop?.notes ?? null,
  });
  const [skuText, setSkuText] = useState((drop?.skus ?? []).join(", "));
  const [pending, start] = useTransition();
  const known = new Set(knownSkus.map((k) => k.sku.toUpperCase()));
  const parsedSkus = skuText.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const unknown = parsedSkus.filter((s) => !known.has(s));

  const save = () =>
    start(async () => {
      const res = await saveLaunchDrop({ ...form, skus: parsedSkus, notes: form.notes?.trim() || null });
      if (res.ok) {
        toast.success(form.id ? "Drop updated" : "Drop added");
        onDone();
      } else toast.error(res.error);
    });

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="ld-name" label="Name" className="col-span-2">
          <Input id="ld-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Tortoise acetate brush drop" />
        </Field>
        <Field id="ld-date" label="Drop date">
          <Input id="ld-date" type="date" value={form.drop_date} onChange={(e) => setForm((f) => ({ ...f, drop_date: e.target.value }))} />
        </Field>
        <Field id="ld-units" label="Planned units">
          <MoneyInput id="ld-units" value={form.planned_units} onChange={(v) => setForm((f) => ({ ...f, planned_units: v == null ? null : Math.round(v) }))} />
        </Field>
        <Field
          id="ld-skus"
          label="SKUs"
          className="col-span-2"
          hint={unknown.length > 0 ? `Not in the products list: ${unknown.join(", ")} (still tracked if orders carry that SKU)` : "Comma-separated. Start typing to pick from products."}
        >
          <Input id="ld-skus" list="ld-known-skus" value={skuText} onChange={(e) => setSkuText(e.target.value)} placeholder="BRB-001, BRB-002" />
          <datalist id="ld-known-skus">
            {knownSkus.map((k) => (
              <option key={k.sku} value={k.sku}>
                {k.name}
              </option>
            ))}
          </datalist>
        </Field>
        <Field id="ld-notes" label="Notes" className="col-span-2">
          <Textarea id="ld-notes" rows={2} value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending || !form.name.trim() || !form.drop_date}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
