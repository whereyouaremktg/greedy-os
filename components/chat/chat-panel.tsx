"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Factory, FileUp, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DOCUMENT_ACCEPT } from "@/lib/documents/upload";
import { enrichNumbers } from "@/components/chat/number-inline";
import { StreamingDots } from "@/components/chat/streaming-dots";
import { renderToolPart } from "@/components/chat/tool-chip";
import {
  pickPrimaryLineItem,
  productNameFromLine,
} from "@/lib/manufacturing/from-parsed";
import type { ParsedManufacturingOrder } from "@/lib/manufacturing/parse-schema";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";

const ANALYST_PROMPTS = [
  "How is our cash?",
  "Overdue POs?",
  "Top wholesale state?",
  "DTC revenue MoM",
] as const;

const ACTION_PROMPTS = [
  "Create a run for Alpine Apothecary, 500 units Daily Cleanser, ETA 2026-06-05",
  "Move the Brightening Serum run to in_transit",
] as const;

function buildParsedMoMessage(parsed: ParsedManufacturingOrder): string {
  const primary = pickPrimaryLineItem(parsed);
  const productName = productNameFromLine(primary);
  const piLabel = parsed.pi_number ?? "unknown";
  return [
    `I uploaded a factory proforma (${piLabel}) from ${parsed.vendor_name}.`,
    `Product line: ${productName}, ${primary.quantity.toLocaleString()} units.`,
    parsed.expected_arrival_date
      ? `Expected arrival: ${parsed.expected_arrival_date}.`
      : null,
    "Please create a manufacturing run from this order.",
    "",
    "Parsed manufacturing order JSON:",
    JSON.stringify(parsed, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildParsedPoMessage(parsed: ParsedPurchaseOrder): string {
  const poLabel = parsed.vendor_po_number ?? parsed.order_number ?? "unknown";
  const totalUnits =
    parsed.total_units ??
    parsed.line_items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice =
    parsed.total_price ??
    parsed.line_items.reduce(
      (sum, item) => sum + item.quantity * (item.unit_price ?? 0),
      0,
    );
  return [
    `I uploaded a wholesale PO (${poLabel}) from ${parsed.buyer_name}.`,
    `Order date: ${parsed.order_date ?? "not specified"}. Total: $${totalPrice.toLocaleString()} (${totalUnits.toLocaleString()} units, ${parsed.line_items.length} styles).`,
    "Please save this purchase order.",
    "",
    "Parsed PO JSON:",
    JSON.stringify(parsed, null, 2),
  ].join("\n");
}

export function ChatPanel({
  variant = "default",
}: {
  variant?: "default" | "drawer";
} = {}) {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const poFileInputRef = useRef<HTMLInputElement>(null);
  const moFileInputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, status } = useChat();
  const isStreaming = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      sendMessage({ text: trimmed });
      setInput("");
      stickToBottom.current = true;
    },
    [isStreaming, sendMessage],
  );

  async function parseAndSend<T>(
    file: File,
    endpoint: string,
    buildMessage: (data: T) => string,
    successToast: string,
    errorToast: string,
  ) {
    if (uploading || isStreaming) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const json = (await res.json()) as {
        ok: boolean;
        data?: T;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.error ?? errorToast);
        return;
      }

      send(buildMessage(json.data));
      toast.success(successToast);
    } catch {
      toast.error(errorToast);
    } finally {
      setUploading(false);
    }
  }

  function onPoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void parseAndSend(
        file,
        "/api/purchase-orders/parse",
        buildParsedPoMessage,
        "PO parsed — asking analyst to save",
        "Failed to upload purchase order",
      );
    }
    e.target.value = "";
  }

  function onMoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void parseAndSend(
        file,
        "/api/manufacturing/parse",
        buildParsedMoMessage,
        "Proforma parsed — asking analyst to create run",
        "Failed to upload proforma",
      );
    }
    e.target.value = "";
  }

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 48;
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  return (
    <div
      className={cn(
        "flex flex-col bg-card",
        variant === "drawer"
          ? "h-full min-h-0"
          : "h-full min-h-[480px] rounded-lg border lg:sticky lg:top-[calc(3rem+1.5rem)] lg:h-[calc(100vh-3rem-3rem)]",
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="size-1.5 rounded-full bg-success animate-pulse" />
        <h2 className="text-sm font-medium">Analyst</h2>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="space-y-2 p-3">
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask about cash, AR, revenue, pipeline, or ops data pulled from
                the cache. Upload a wholesale PO or factory proforma to create
                orders and production runs.
              </p>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Analyze
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ANALYST_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      disabled={isStreaming}
                      className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
                      suppressHydrationWarning
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Actions
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ACTION_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      disabled={isStreaming}
                      className="rounded-full border border-dashed border-brand/35 bg-brand/5 px-2.5 py-1 text-[11px] text-foreground/80 transition-colors hover:border-brand/50 hover:bg-brand/10 disabled:opacity-50"
                      suppressHydrationWarning
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-md px-3 py-2 text-[13px] leading-relaxed",
                m.role === "user"
                  ? "bg-muted/80 text-foreground"
                  : "bg-transparent",
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {m.role === "user" ? "You" : "Analyst"}
              </div>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <p key={i} className="whitespace-pre-wrap">
                      {m.role === "assistant"
                        ? enrichNumbers(part.text)
                        : part.text}
                    </p>
                  );
                }
                if (m.role === "assistant") {
                  return renderToolPart(part, i);
                }
                return null;
              })}
            </div>
          ))}

          {isStreaming &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") ? (
            <StreamingDots />
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t p-3"
      >
        <input
          ref={poFileInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={onPoFileChange}
        />
        <input
          ref={moFileInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={onMoFileChange}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={isStreaming || uploading}
          onClick={() => poFileInputRef.current?.click()}
          title="Upload wholesale PO"
        >
          <FileUp className={cn("size-3.5", uploading && "animate-pulse")} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={isStreaming || uploading}
          onClick={() => moFileInputRef.current?.click()}
          title="Upload factory proforma"
        >
          <Factory className={cn("size-3.5", uploading && "animate-pulse")} />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the analyst…"
          disabled={isStreaming}
          className="h-8 text-sm"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={isStreaming || uploading || !input.trim()}
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
