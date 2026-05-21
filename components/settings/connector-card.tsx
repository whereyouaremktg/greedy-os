"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveConnectorCredentials,
  clearConnector,
} from "@/lib/actions/settings";
import type {
  CredentialStatus,
  CredentialSource,
} from "@/lib/connectors/credentials";

type Field = {
  key: string;
  label: string;
  type: "secret" | "text";
  required: boolean;
  hint?: string;
};

const SOURCE_BADGE: Record<
  Exclude<CredentialSource, null>,
  { label: string; variant: "default" | "secondary" }
> = {
  settings: { label: "Saved", variant: "default" },
  env: { label: "Env var", variant: "secondary" },
};

function ConnectorPill({ statuses }: { statuses: CredentialStatus[] }) {
  const required = statuses.length;
  const configured = statuses.filter((s) => s.source !== null).length;
  if (configured === 0) {
    return (
      <Badge variant="outline" className="gap-1">
        <Circle className="size-3" />
        Not connected
      </Badge>
    );
  }
  if (configured < required) {
    return (
      <Badge variant="outline" className="gap-1">
        <Circle className="size-3" />
        Partial
      </Badge>
    );
  }
  return (
    <Badge variant="default" className="gap-1">
      <CheckCircle2 className="size-3" />
      Connected
    </Badge>
  );
}

function FieldRow({
  field,
  status,
  value,
  onChange,
}: {
  field: Field;
  status: CredentialStatus | undefined;
  value: string;
  onChange: (next: string) => void;
}) {
  const source = status?.source ?? null;
  const sourceBadge = source ? SOURCE_BADGE[source] : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={field.key} className="text-[13px]">
          {field.label}
          {field.required ? (
            <span className="ml-1 text-destructive">*</span>
          ) : null}
        </Label>
        {sourceBadge ? (
          <Badge variant={sourceBadge.variant} className="gap-1">
            {source === "env" ? <Server className="size-3" /> : null}
            {sourceBadge.label}
          </Badge>
        ) : null}
      </div>
      <Input
        id={field.key}
        name={field.key}
        type={field.type === "secret" ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        placeholder={
          source === "settings"
            ? "•••••••••• (saved — paste to replace)"
            : source === "env"
              ? "Set via Vercel env (paste to override here)"
              : field.type === "secret"
                ? "Paste value"
                : ""
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {field.hint ? (
        <p className="text-[11px] text-muted-foreground">{field.hint}</p>
      ) : null}
    </div>
  );
}

export type ConnectorCardProps = {
  id: string;
  label: string;
  description: string;
  fields: readonly Field[];
  statuses: CredentialStatus[];
};

export function ConnectorCard({
  id,
  label,
  description,
  fields,
  statuses,
}: ConnectorCardProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [clearPending, startClearTransition] = React.useTransition();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const statusByKey = React.useMemo(
    () => new Map(statuses.map((s) => [s.key, s])),
    [statuses],
  );
  const anyConfigured = statuses.some((s) => s.source !== null);
  const anyDirty = Object.values(values).some((v) => v.trim().length > 0);

  function setField(key: string, next: string) {
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveConnectorCredentials(id, values);
      if (result.ok) {
        toast.success(`${label} credentials saved`);
        setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onClear() {
    if (
      !window.confirm(
        `Disconnect ${label}? Stored credentials will be deleted. ` +
          `Env-var values (if any) will still apply.`,
      )
    ) {
      return;
    }
    startClearTransition(async () => {
      const result = await clearConnector(id);
      if (result.ok) {
        toast.success(`${label} disconnected`);
        setValues(Object.fromEntries(fields.map((f) => [f.key, ""])));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const busy = pending || clearPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{label}</span>
          <ConnectorPill statuses={statuses} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-3">
            {fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                status={statusByKey.get(field.key)}
                value={values[field.key] ?? ""}
                onChange={(v) => setField(field.key, v)}
              />
            ))}
          </div>
          <div
            className={cn(
              "flex items-center justify-end gap-2 border-t pt-4",
              "text-xs text-muted-foreground",
            )}
          >
            {anyConfigured ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={busy}
                className="mr-auto"
              >
                {clearPending ? "Disconnecting…" : "Disconnect"}
              </Button>
            ) : null}
            <Button type="submit" disabled={busy || !anyDirty}>
              {pending ? "Saving…" : "Save credentials"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
