"use client";

import * as React from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DOCUMENT_ACCEPT } from "@/lib/documents/upload";
import { cn } from "@/lib/utils";
import type { ParsedPurchaseOrder } from "@/lib/purchase-orders/schema";

type Props = {
  onParsed: (data: ParsedPurchaseOrder) => void;
  disabled?: boolean;
  className?: string;
};

export function PoUploadDropzone({ onParsed, disabled, className }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);

  async function handleFile(file: File) {
    if (parsing || disabled) return;

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/purchase-orders/parse", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        ok: boolean;
        data?: ParsedPurchaseOrder;
        error?: string;
      };

      if (!res.ok || !json.ok || !json.data) {
        toast.error(json.error ?? "Failed to parse purchase order");
        return;
      }

      onParsed(json.data);
      toast.success("Purchase order parsed — review and save");
    } catch {
      toast.error("Failed to upload purchase order");
    } finally {
      setParsing(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-dashed p-6 text-center transition-colors",
        dragging ? "border-brand bg-brand/5" : "border-border/80 bg-muted/20",
        (disabled || parsing) && "pointer-events-none opacity-60",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={onInputChange}
      />

      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
        {parsing ? (
          <Loader2 className="size-8 text-brand animate-spin" />
        ) : (
          <FileUp className="size-8 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {parsing ? "Parsing purchase order…" : "Upload a PO document"}
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Drop a PDF or screenshot of a wholesale PO (e.g. REVOLVE). We extract
          line items, dates, and totals automatically.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={parsing || disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>
    </div>
  );
}
