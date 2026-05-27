"use client";

import * as React from "react";

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Wide, vertically scrolling review dialog — avoids horizontal scroll in nested tables. */
export function ReviewDialogShell({
  title,
  description,
  footer,
  children,
  className,
}: {
  title: string;
  description: string;
  footer: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[min(90dvh,920px)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-4xl",
        className,
      )}
    >
      <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </div>

      <DialogFooter className="shrink-0 border-t px-5 py-4">{footer}</DialogFooter>
    </DialogContent>
  );
}

export function ReviewSummaryGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function ReviewSummaryItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
    </div>
  );
}

export function ReviewHighlightCard({
  label,
  title,
  meta,
}: {
  label: string;
  title: string;
  meta?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 sm:col-span-2 lg:col-span-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-relaxed font-medium wrap-break-word">
        {title}
      </p>
      {meta ? <div className="mt-2 text-sm text-muted-foreground">{meta}</div> : null}
    </div>
  );
}

export type ParsedLineRow = {
  key: string;
  title: string;
  subtitle?: string;
  quantity: number;
  trailing?: React.ReactNode;
  badge?: string;
};

export function ParsedLineItemsList({ items }: { items: ParsedLineRow[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-start gap-3 px-4 py-3 sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug font-medium wrap-break-word">
              {item.title}
            </p>
            {item.subtitle ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground wrap-break-word">
                {item.subtitle}
              </p>
            ) : null}
            {item.trailing ? (
              <div className="mt-2 sm:hidden">{item.trailing}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-right">
            <span className="num text-sm font-semibold tabular-nums">
              {item.quantity.toLocaleString()}
            </span>
            {item.badge ? (
              <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                {item.badge}
              </span>
            ) : null}
            {item.trailing ? (
              <div className="hidden sm:block">{item.trailing}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
