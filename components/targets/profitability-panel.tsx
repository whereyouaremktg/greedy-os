"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
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
import { saveProductUnitCost, saveWeeklyInputs, type WeeklyInputsInput } from "@/lib/actions/targets-profit";
import type { WeekProfit } from "@/lib/targets/profit";
import type { ProfitabilityData } from "@/lib/targets/profitability";
import type { TargetsSettings } from "@/lib/targets/settings";
import { Field, MoneyInput } from "@/components/targets/field";
import { SectionHeading } from "@/components/targets/revenue-sections";
import { count, ratioPct, usd } from "@/components/targets/format";

export function ProfitabilityPanel({ profit, settings }: { profit: ProfitabilityData; settings: TargetsSettings }) {
  const [editingWeek, setEditingWeek] = useState<WeekProfit | null>(null);
  const [costsOpen, setCostsOpen] = useState(false);
  const q = profit.quarter;
  const minMargin = settings.guardrails.net_margin_min_pct;
  const coverage = profit.skuCostCoverage;

  return (
    <section className="space-y-3">
      <SectionHeading
        title="Profitability"
        note="Gross margin from SKU unit costs; contribution and net margin need the weekly ad spend and opex inputs. 3PL uses the RetroShip invoice when entered, else the fulfillment estimate above."
      />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Gross margin"
          value={q.grossMargin != null ? ratioPct(q.grossMargin) : "—"}
          sub={q.cogs != null ? `COGS ${usd(q.cogs)} on ${usd(q.netSales)} net` : "Needs unit costs or a COGS override"}
          hint={`${coverage.withCost}/${coverage.total} SKUs have a unit cost`}
        />
        <KpiTile
          title="Contribution margin"
          value={q.contributionMargin != null ? ratioPct(q.contributionMargin) : "—"}
          sub="After ad spend and 3PL"
          hint={`${q.weeksWithInputs} of ${q.weeksWithSales} weeks have inputs${profit.weeks.some((w) => w.threeplSource === "fulfillment") ? " · 3PL estimated from ShipHero where no invoice" : ""}`}
        />
        <KpiTile
          title="Net margin"
          value={q.netMargin != null ? ratioPct(q.netMargin) : "—"}
          status={q.netMargin == null ? "pending" : q.netMargin * 100 >= minMargin ? "live" : "stale"}
          sub={`Guardrail ≥ ${minMargin}%`}
          hint={q.netMargin == null ? "Enter weekly costs below" : undefined}
        />
        <KpiTile
          title="Ad spend · MER"
          value={q.adSpend != null ? `${usd(q.adSpend)} · ${q.mer != null ? `${q.mer.toFixed(1)}x` : "—"}` : "—"}
          sub="MER = net sales ÷ ad spend"
        />
      </div>

      <Card size="sm" className="py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Weeks start Monday. Flags: discount rate above {settings.flags.discount_rate_max_pct}% or net margin below {minMargin}%.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setCostsOpen(true)}>
            <Pencil />
            Unit costs
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead className="text-right">Net sales</TableHead>
              <TableHead className="text-right">Disc.</TableHead>
              <TableHead className="text-right hidden md:table-cell">Gross</TableHead>
              <TableHead className="text-right hidden md:table-cell">Ad spend</TableHead>
              <TableHead className="text-right hidden lg:table-cell">MER</TableHead>
              <TableHead className="text-right hidden lg:table-cell">Contrib.</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {profit.weeks.map((w) => {
              const flagged = w.flags.includes("discount") || w.flags.includes("net_margin");
              return (
                <TableRow key={w.weekStart} className={cn(flagged && "bg-danger/5", w.isCurrent && "font-medium")}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {flagged ? <AlertTriangle className="size-3.5 text-danger" /> : null}
                      {w.label}
                      {w.isCurrent ? <Badge variant="outline" className="text-[10px]">this week</Badge> : null}
                    </div>
                    {w.flags.length > 0 || w.threeplSource === "fulfillment" ? (
                      <div className="text-[10px] text-muted-foreground">
                        {[
                          ...w.flags.map((f) => (f === "discount" ? "discount rate high" : f === "net_margin" ? "net margin low" : "needs inputs")),
                          ...(w.threeplSource === "fulfillment" ? ["3PL est."] : []),
                        ].join(" · ")}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-right">{usd(w.netSales)}</TableCell>
                  <TableCell className={cn("num text-right", w.flags.includes("discount") && "text-danger")}>
                    {ratioPct(w.discountRate)}
                  </TableCell>
                  <TableCell className="num text-right hidden md:table-cell">
                    {w.grossMargin != null ? ratioPct(w.grossMargin, 0) : "—"}
                    {w.cogsCoverage > 0 && w.cogsCoverage < 0.95 ? (
                      <div className="text-[10px] text-muted-foreground">{Math.round(w.cogsCoverage * 100)}% of units costed</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="num text-right hidden md:table-cell">{w.adSpend != null ? usd(w.adSpend) : "—"}</TableCell>
                  <TableCell className="num text-right hidden lg:table-cell">{w.mer != null ? `${w.mer.toFixed(1)}x` : "—"}</TableCell>
                  <TableCell className="num text-right hidden lg:table-cell">
                    {w.contributionMargin != null ? ratioPct(w.contributionMargin, 0) : "—"}
                  </TableCell>
                  <TableCell className={cn("num text-right", w.flags.includes("net_margin") && "text-danger")}>
                    {w.netMargin != null ? ratioPct(w.netMargin, 0) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-xs" aria-label={`Edit inputs for ${w.label}`} onClick={() => setEditingWeek(w)}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <WeekInputsDialog
        week={editingWeek}
        initial={editingWeek ? profit.inputs[editingWeek.weekStart] ?? null : null}
        onOpenChange={(o) => !o && setEditingWeek(null)}
      />
      <UnitCostsDialog open={costsOpen} onOpenChange={setCostsOpen} products={profit.products} />
    </section>
  );
}

function WeekInputsDialog({
  week,
  initial,
  onOpenChange,
}: {
  week: WeekProfit | null;
  initial: ProfitabilityData["inputs"][string] | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={week !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Costs · week of {week?.label}</DialogTitle>
          <DialogDescription>
            Manual inputs the dashboard cannot pull: ad spend by platform, RetroShip 3PL invoice, other operating
            costs. Blank fields stay unknown.
          </DialogDescription>
        </DialogHeader>
        {week ? <WeekInputsForm key={week.weekStart} weekStart={week.weekStart} initial={initial} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function WeekInputsForm({
  weekStart,
  initial,
  onDone,
}: {
  weekStart: string;
  initial: ProfitabilityData["inputs"][string] | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<WeeklyInputsInput>({
    week_start: weekStart,
    ad_spend_meta: initial?.adSpendMeta ?? null,
    ad_spend_tiktok: initial?.adSpendTiktok ?? null,
    ad_spend_google: initial?.adSpendGoogle ?? null,
    ad_spend_other: initial?.adSpendOther ?? null,
    threepl_cost: initial?.threeplCost ?? null,
    other_opex: initial?.otherOpex ?? null,
    cogs_override: initial?.cogsOverride ?? null,
    notes: initial?.notes ?? null,
  });
  const [pending, start] = useTransition();
  const set = <K extends keyof WeeklyInputsInput>(k: K, v: WeeklyInputsInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = () =>
    start(async () => {
      const res = await saveWeeklyInputs({ ...form, notes: form.notes?.trim() || null });
      if (res.ok) {
        toast.success("Week saved");
        onDone();
      } else toast.error(res.error);
    });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field id="wi-meta" label="Meta ad spend $">
          <MoneyInput id="wi-meta" value={form.ad_spend_meta} onChange={(v) => set("ad_spend_meta", v)} />
        </Field>
        <Field id="wi-tiktok" label="TikTok ad spend $">
          <MoneyInput id="wi-tiktok" value={form.ad_spend_tiktok} onChange={(v) => set("ad_spend_tiktok", v)} />
        </Field>
        <Field id="wi-google" label="Google ad spend $">
          <MoneyInput id="wi-google" value={form.ad_spend_google} onChange={(v) => set("ad_spend_google", v)} />
        </Field>
        <Field id="wi-other-ad" label="Other ad spend $">
          <MoneyInput id="wi-other-ad" value={form.ad_spend_other} onChange={(v) => set("ad_spend_other", v)} />
        </Field>
        <Field id="wi-3pl" label="3PL / RetroShip $">
          <MoneyInput id="wi-3pl" value={form.threepl_cost} onChange={(v) => set("threepl_cost", v)} />
        </Field>
        <Field id="wi-opex" label="Other opex $" hint="Payroll, software, fees — whatever net margin should carry.">
          <MoneyInput id="wi-opex" value={form.other_opex} onChange={(v) => set("other_opex", v)} />
        </Field>
        <Field id="wi-cogs" label="COGS override $" hint="Replaces the SKU-cost estimate for this week." className="col-span-2">
          <MoneyInput id="wi-cogs" value={form.cogs_override} onChange={(v) => set("cogs_override", v)} />
        </Field>
        <Field id="wi-notes" label="Notes" className="col-span-2">
          <Textarea id="wi-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

function UnitCostsDialog({
  open,
  onOpenChange,
  products,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProfitabilityData["products"];
}) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = (sku: string) =>
    start(async () => {
      const raw = draft[sku];
      const value = raw == null || raw.trim() === "" ? null : Number(raw);
      if (value != null && !Number.isFinite(value)) {
        toast.error("Enter a number");
        return;
      }
      const res = await saveProductUnitCost({ sku, unit_cost_usd: value });
      if (res.ok) toast.success(`${sku} saved`);
      else toast.error(res.error);
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Landed unit costs</DialogTitle>
          <DialogDescription>
            Per-SKU cost used for COGS and gross margin. Save each row; blank clears it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="w-32 text-right">Unit cost $</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.sku}>
                  <TableCell className="num text-xs">{p.sku}</TableCell>
                  <TableCell className="text-xs">{p.name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      className="h-7 text-right"
                      aria-label={`Unit cost for ${p.sku}`}
                      value={draft[p.sku] ?? (p.unitCost ?? "")}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.sku]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="xs" disabled={pending || draft[p.sku] == null} onClick={() => save(p.sku)}>
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <span className="mr-auto text-[11px] text-muted-foreground">{count(products.length)} SKUs</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
