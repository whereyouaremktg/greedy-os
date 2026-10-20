"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { saveTargetsSettings } from "@/lib/actions/targets";
import type { TargetsSettings } from "@/lib/targets/settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: TargetsSettings;
};

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export function TargetsSettingsSheet({ open, onOpenChange, settings }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Q4 targets settings</SheetTitle>
          <SheetDescription>
            Goals, guardrails and the manual figures the dashboard cannot pull yet. Saved for everyone.
          </SheetDescription>
        </SheetHeader>
        {/* The popup unmounts when closed, so the draft starts from the saved settings on every open. */}
        {open ? <SettingsForm settings={settings} onDone={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SettingsForm({ settings, onDone }: { settings: TargetsSettings; onDone: () => void }) {
  const [draft, setDraft] = useState<TargetsSettings>(settings);
  const [pending, start] = useTransition();

  const setTier = (i: number, amount: number) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((t, j) => (j === i ? { ...t, amount } : t)) }));
  const setOverride = <K extends keyof TargetsSettings["overrides"]>(k: K, v: TargetsSettings["overrides"][K]) =>
    setDraft((d) => ({ ...d, overrides: { ...d.overrides, [k]: v } }));
  const setBfcm = <K extends keyof TargetsSettings["bfcm"]>(k: K, v: string) =>
    setDraft((d) => ({ ...d, bfcm: { ...d.bfcm, [k]: v } }));
  const setStaff = (
    group: "bfcm_orders" | "busiest_day",
    k: "safe" | "baseline" | "aggressive",
    v: number,
  ) => setDraft((d) => ({ ...d, staffing: { ...d.staffing, [group]: { ...d.staffing[group], [k]: v } } }));

  const save = () =>
    start(async () => {
      const res = await saveTargetsSettings(draft);
      if (res.ok) {
        toast.success("Targets settings saved");
        onDone();
      } else {
        toast.error(res.error);
      }
    });

  return (
    <>
        <div className="space-y-6 px-4 pb-4">
          <Group title="Manual overrides">
            <Field
              id="net-margin"
              label="Q4 net margin %"
              hint="QuickBooks P&L is stale; enter the latest figure from the books."
            >
              <Input
                id="net-margin"
                type="number"
                step="0.1"
                value={draft.overrides.net_margin_pct ?? ""}
                onChange={(e) => setOverride("net_margin_pct", numOrNull(e.target.value))}
                placeholder="e.g. 27.5"
              />
            </Field>
            <Field id="cash" label="Cash balance $" hint="Blank uses the last QuickBooks bank balance.">
              <Input
                id="cash"
                type="number"
                step="1"
                value={draft.overrides.cash_balance ?? ""}
                onChange={(e) => setOverride("cash_balance", numOrNull(e.target.value))}
                placeholder="e.g. 220000"
              />
            </Field>
            <Field
              id="baseline"
              label="Q4 2025 non-Shopify revenue $"
              hint="Wholesale and other revenue not in Shopify; added to the Shopify actual."
            >
              <Input
                id="baseline"
                type="number"
                step="1"
                value={draft.overrides.non_shopify_baseline_2025 ?? ""}
                onChange={(e) => setOverride("non_shopify_baseline_2025", numOrNull(e.target.value))}
              />
            </Field>
            <div className="col-span-2">
              <Field id="notes" label="Notes">
                <Textarea
                  id="notes"
                  rows={2}
                  value={draft.overrides.notes}
                  onChange={(e) => setOverride("notes", e.target.value)}
                  placeholder="Where the figures came from, as of when"
                />
              </Field>
            </div>
          </Group>

          <Group title="Goal tiers">
            {draft.tiers.map((t, i) => (
              <Field key={t.key} id={`tier-${t.key}`} label={`${t.label} $`}>
                <Input
                  id={`tier-${t.key}`}
                  type="number"
                  step="1000"
                  value={t.amount}
                  onChange={(e) => setTier(i, Number(e.target.value) || 0)}
                />
              </Field>
            ))}
            <div className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <div className="text-sm">Count B2B orders in the Q4 total</div>
                <div className="text-[11px] text-muted-foreground">Shopify orders tagged B2B</div>
              </div>
              <Switch
                checked={draft.count_b2b_in_total}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, count_b2b_in_total: checked }))}
              />
            </div>
          </Group>

          <Group title="Guardrails">
            <Field id="g-margin" label="Net margin at least %">
              <Input
                id="g-margin"
                type="number"
                step="0.5"
                value={draft.guardrails.net_margin_min_pct}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    guardrails: { ...d.guardrails, net_margin_min_pct: Number(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field id="g-cash" label="Cash reserve at least $">
              <Input
                id="g-cash"
                type="number"
                step="1000"
                value={draft.guardrails.cash_reserve_min}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    guardrails: { ...d.guardrails, cash_reserve_min: Number(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field id="g-disc" label="Flag discount rate above %">
              <Input
                id="g-disc"
                type="number"
                step="0.5"
                value={draft.flags.discount_rate_max_pct}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, flags: { ...d.flags, discount_rate_max_pct: Number(e.target.value) || 0 } }))
                }
              />
            </Field>
          </Group>

          <Group title="BFCM dates">
            {(
              [
                ["start", "Module start"],
                ["end", "Module end"],
                ["bf_cm_start", "Black Friday"],
                ["bf_cm_end", "Cyber Monday"],
                ["early_access", "Early access day"],
                ["sla_ship_by", "Ship-by for SLA"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} id={`bf-${k}`} label={label}>
                <Input id={`bf-${k}`} type="date" value={draft.bfcm[k]} onChange={(e) => setBfcm(k, e.target.value)} />
              </Field>
            ))}
          </Group>

          <Group title="RetroShip staffing tiers · BF–CM orders">
            {(["safe", "baseline", "aggressive"] as const).map((k) => (
              <Field key={k} id={`st-o-${k}`} label={k[0].toUpperCase() + k.slice(1)}>
                <Input
                  id={`st-o-${k}`}
                  type="number"
                  value={draft.staffing.bfcm_orders[k]}
                  onChange={(e) => setStaff("bfcm_orders", k, Number(e.target.value) || 0)}
                />
              </Field>
            ))}
          </Group>
          <Group title="RetroShip staffing tiers · busiest day">
            {(["safe", "baseline", "aggressive"] as const).map((k) => (
              <Field key={k} id={`st-d-${k}`} label={k[0].toUpperCase() + k.slice(1)}>
                <Input
                  id={`st-d-${k}`}
                  type="number"
                  value={draft.staffing.busiest_day[k]}
                  onChange={(e) => setStaff("busiest_day", k, Number(e.target.value) || 0)}
                />
              </Field>
            ))}
          </Group>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
    </>
  );
}
