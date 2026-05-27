"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, EmptyStateAction } from "@/components/empty-state";
import {
  deleteSlackIdentity,
  upsertSlackIdentity,
} from "@/lib/actions/slack-identities";
import type {
  GlowAuthUserOption,
  SlackIdentityRow,
} from "@/lib/settings/slack-identities-data";
import { cn } from "@/lib/utils";

const SLACK_ID_RE = /^U[A-Z0-9]+$/i;

function CopySlackIdButton({ slackUserId }: { slackUserId: string }) {
  const [pending, start] = React.useTransition();

  function onCopy() {
    start(async () => {
      try {
        await navigator.clipboard.writeText(slackUserId);
        toast.success("Copied Slack ID");
      } catch {
        toast.error("Could not copy");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={onCopy}
      disabled={pending}
      aria-label="Copy Slack ID"
    >
      <Copy className="size-3.5" />
    </Button>
  );
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; row: SlackIdentityRow };

export function SlackIdentitiesCard({
  rows,
  authUsers,
}: {
  rows: SlackIdentityRow[];
  authUsers: GlowAuthUserOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const [slackUserId, setSlackUserId] = React.useState("");
  const [supabaseUserId, setSupabaseUserId] = React.useState("");
  const [savePending, startSave] = React.useTransition();
  const [deletePending, startDelete] = React.useTransition();

  function openCreate() {
    setSlackUserId("");
    setSupabaseUserId(authUsers[0]?.id ?? "");
    setDialog({ mode: "create" });
  }

  function openEdit(row: SlackIdentityRow) {
    setSlackUserId(row.slack_user_id);
    setSupabaseUserId(row.supabase_user_id);
    setDialog({ mode: "edit", row });
  }

  function closeDialog() {
    setDialog(null);
  }

  const slackIdValid = SLACK_ID_RE.test(slackUserId.trim());
  const canSave =
    slackIdValid && supabaseUserId.length > 0 && !savePending;

  function onSave() {
    if (!canSave) return;
    startSave(async () => {
      const result = await upsertSlackIdentity({
        slack_user_id: slackUserId.trim(),
        supabase_user_id: supabaseUserId,
      });
      if (result.ok) {
        toast.success("Slack identity saved");
        closeDialog();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function onDelete(slack_user_id: string) {
    if (
      !window.confirm(
        `Remove the link for Slack user ${slack_user_id}? They will need to be linked again before using Glow in Slack.`,
      )
    ) {
      return;
    }
    startDelete(async () => {
      const result = await deleteSlackIdentity(slack_user_id);
      if (result.ok) {
        toast.success("Slack identity removed");
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
          <span>Slack identities</span>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-3.5" />
            Add link
          </Button>
        </CardTitle>
        <CardDescription>
          Map a Slack member ID to a Glow OS account so @Glow and DMs know who is
          asking. Use this when Slack email does not match the Glow login email.
          Find a member ID in Slack: open the profile, More, Copy member ID.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No Slack identities linked"
            description="Link Slack member IDs to Glow OS users so the bot can run tools and answer questions in your workspace. Copy a member ID from a Slack profile, then add a row here."
            action={
              <EmptyStateAction onClick={openCreate}>
                Add link
              </EmptyStateAction>
            }
          />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slack ID</TableHead>
                  <TableHead>Slack email</TableHead>
                  <TableHead>Glow email</TableHead>
                  <TableHead>Linked</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                    <TableRow
                      key={row.slack_user_id}
                      className="group"
                    >
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[13px]">
                            {row.slack_user_id}
                          </span>
                          <CopySlackIdButton slackUserId={row.slack_user_id} />
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {row.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {row.glow_email ?? "—"}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground tabular-nums">
                        {row.linked_at_relative}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            type="button"
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              deletePending && "opacity-100",
                            )}
                            aria-label="Row actions"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              Edit link
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDelete(row.slack_user_id)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialog !== null} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.mode === "edit" ? "Edit Slack link" : "Add Slack link"}
              </DialogTitle>
              <DialogDescription>
                Paste the Slack member ID (starts with U) and choose the Glow OS
                user it should act as in Slack.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="slack_user_id" className="text-[13px]">
                  Slack user ID
                </Label>
                <Input
                  id="slack_user_id"
                  value={slackUserId}
                  onChange={(e) => setSlackUserId(e.target.value)}
                  placeholder="U07ABC123"
                  className="font-mono"
                  spellCheck={false}
                  disabled={dialog?.mode === "edit"}
                />
                {slackUserId.trim().length > 0 && !slackIdValid ? (
                  <p className="text-[11px] text-destructive">
                    Must match U followed by letters and numbers.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supabase_user_id" className="text-[13px]">
                  Glow OS user
                </Label>
                <Select
                  id="supabase_user_id"
                  value={supabaseUserId}
                  onChange={(e) => setSupabaseUserId(e.target.value)}
                >
                  {authUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="button" onClick={onSave} disabled={!canSave}>
                {savePending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
