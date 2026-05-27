"use client";

import Link from "next/link";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

import {
  formatToolRunningLabel,
  formatToolSuccessLabel,
} from "@/lib/ai/tool-labels";
import { isGlowToolResult } from "@/lib/ai/tool-results";
import { cn } from "@/lib/utils";

type ToolPart = Extract<
  UIMessage["parts"][number],
  { type: `tool-${string}` } | { type: "dynamic-tool" }
>;

function runLinkId(toolName: string, output: unknown): { href: string; id: string } | null {
  if (!isGlowToolResult(output) || !output.ok) return null;
  const id = (output.data as { id?: string }).id;
  if (!id) return null;

  if (toolName === "createPurchaseOrder" || toolName === "listPurchaseOrders") {
    return { href: "/purchase-orders", id };
  }

  return { href: "/manufacturing", id };
}

export function ToolChip({ part }: { part: ToolPart }) {
  const toolName = getToolName(part);

  if (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested"
  ) {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="text-brand">⟳</span>
        <span>{formatToolRunningLabel(toolName)}</span>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
        <span>✗</span>
        <span>{part.errorText}</span>
      </div>
    );
  }

  if (part.state === "output-available") {
    const output = part.output;
    if (isGlowToolResult(output) && !output.ok) {
      return (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
          <span>✗</span>
          <span>{output.error.message}</span>
        </div>
      );
    }

    const label = isGlowToolResult(output)
      ? formatToolSuccessLabel(toolName, output)
      : formatToolRunningLabel(toolName);
    const link = runLinkId(toolName, output);

    return (
      <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
        <span className="text-brand">✓</span>
        {link ? (
          <Link
            href={link.href}
            className="hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <span>{label}</span>
            <span className="num ml-1 font-mono text-[10px] opacity-70">
              #{link.id.slice(0, 8)}
            </span>
          </Link>
        ) : (
          <span>{label}</span>
        )}
      </div>
    );
  }

  return null;
}

export function renderToolPart(part: UIMessage["parts"][number], index: number) {
  if (!isToolUIPart(part)) return null;
  return <ToolChip key={`tool-${index}`} part={part} />;
}

export function messagePartClassName(type: string): string {
  return cn(type.startsWith("tool-") || type === "dynamic-tool" ? "block" : "");
}
