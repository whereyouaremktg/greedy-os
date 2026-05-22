"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Server,
} from "lucide-react";

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
  disconnectQuickbooks,
} from "@/lib/actions/settings";
import type {
  CredentialStatus,
  CredentialSource,
  QuickbooksConnectionState,
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

function ConnectionBadge({ state }: { state: QuickbooksConnectionState }) {
  if (state.kind === "needs_app_credentials") {
    return (
      <Badge variant="outline" className="gap-1">
        <Circle className="size-3" />
        Not connected
      </Badge>
    );
  }
  if (state.kind === "ready_to_connect") {
    return (
      <Badge variant="outline" className="gap-1">
        <Circle className="size-3" />
        Ready to connect
      </Badge>
    );
  }
  if (state.reconnectRecommended) {
    return (
      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/50">
        <AlertTriangle className="size-3" />
        Reconnect soon
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

function ConnectionDetails({ state }: { state: QuickbooksConnectionState }) {
  if (state.kind === "needs_app_credentials") {
    return (
      <p className="text-[12px] text-muted-foreground">
        Paste your Intuit app&apos;s Client ID and Secret below, then click
        Connect to grant Glow OS access to your QuickBooks data.
      </p>
    );
  }
  if (state.kind === "ready_to_connect") {
    return (
      <p className="text-[12px] text-muted-foreground">
        App credentials saved. Click Connect to open Intuit&apos;s consent
        screen and authorize Glow OS.
      </p>
    );
  }

  const daysText =
    state.refreshExpiresInDays == null
      ? "expiry unknown"
      : state.refreshExpiresInDays < 0
        ? `expired ${Math.abs(state.refreshExpiresInDays)}d ago`
        : `refreshes in ${state.refreshExpiresInDays}d`;

  return (
    <div className="space-y-1 text-[12px] text-muted-foreground">
      <div>
        Realm{" "}
        <span className="font-mono text-foreground">{state.realmId}</span>{" "}
        · env{" "}
        <span className="font-mono text-foreground">{state.env}</span>
      </div>
      <div>
        Token{" "}
        <span
          className={cn(
            state.reconnectRecommended ? "text-amber-600" : "text-foreground",
          )}
        >
          {daysText}
        </span>
      </div>
    </div>
  );
}

export type QuickbooksCardProps = {
  id: "quickbooks";
  label: string;
  description: string;
  fields: readonly Field[];
  statuses: CredentialStatus[];
  state: QuickbooksConnectionState;
};

export function QuickbooksCard({
  id,
  label,
  description,
  fields,
  statuses,
  state,
}: QuickbooksCardProps) {
  const router = useRouter();
  const [savePending, startSave] = React.useTransition();
  const [disconnectPending, startDisconnect] = React.useTransition();
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, ""])),
  );
  const statusByKey = React.useMemo(
    () => new Map(statuses.map((s) => [s.key, s])),
    [statuses],
  );
  const anyDirty = Object.values(values).some((v) => v.trim().length > 0);
  const busy = savePending || disconnectPending;

  const connectLabel =
    state.kind === "connected"
      ? state.reconnectRecommended
        ? "Reconnect"
        : "Reconnect"
      : "Connect";
  const canConnect =
    state.kind === "ready_to_connect" || state.kind === "connected";

  function setField(key: string, next: string) {
    setValues((prev) => ({ ...prev, [key]: next }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startSave(async () => {
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

  function onConnect() {
    window.location.href = "/api/oauth/quickbooks/authorize";
  }

  function onDisconnect() {
    if (
      !window.confirm(
        `Disconnect ${label}? OAuth tokens will be removed. Your Client ID and Secret stay saved so you can reconnect without re-pasting them.`,
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      const result = await disconnectQuickbooks();
      if (result.ok) {
        toast.success(`${label} disconnected`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{label}</span>
          <ConnectionBadge state={state} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <ConnectionDetails state={state} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {state.kind === "connected" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDisconnect}
                    disabled={busy}
                  >
                    {disconnectPending ? "Disconnecting…" : "Disconnect"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={onConnect}
                  disabled={busy || !canConnect}
                >
                  {connectLabel}
                  <ExternalLink className="ml-1 size-3" />
                </Button>
              </div>
            </div>
          </div>

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
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button type="submit" disabled={busy || !anyDirty}>
                {savePending ? "Saving…" : "Save app credentials"}
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
