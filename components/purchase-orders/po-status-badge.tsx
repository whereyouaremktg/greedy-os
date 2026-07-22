import {
  formatPoStatusLabel,
  type PoStatus,
} from "@/lib/purchase-orders/statuses";
import { cn } from "@/lib/utils";

// One hue per pipeline stage so a scan of the board/list reads as progress:
// neutral (draft) → brand (confirmed) → sky (fulfillment) → violet (transit)
// → teal (delivered) → emerald (paid). Cancelled is muted out.
const STATUS_STYLES: Record<
  PoStatus,
  { pill: string; dot: string }
> = {
  draft: {
    pill: "border-border/70 bg-muted/60 text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  sent: {
    pill: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  confirmed: {
    pill: "border-brand/30 bg-brand/10 text-brand-foreground/80 dark:text-brand",
    dot: "bg-brand",
  },
  in_fulfillment: {
    pill: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
  shipped: {
    pill: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  partially_received: {
    pill: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  received: {
    pill: "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  closed: {
    pill: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  cancelled: {
    pill: "border-border/70 bg-muted/60 text-muted-foreground line-through decoration-muted-foreground/40",
    dot: "bg-muted-foreground/40",
  },
};

export function poStatusDotClass(status: PoStatus | string): string {
  return STATUS_STYLES[status as PoStatus]?.dot ?? "bg-muted-foreground/50";
}

export function PoStatusBadge({
  status,
  className,
}: {
  status: PoStatus | string;
  className?: string;
}) {
  const styles =
    STATUS_STYLES[status as PoStatus] ?? STATUS_STYLES.draft;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        styles.pill,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", styles.dot)} aria-hidden />
      {formatPoStatusLabel(status)}
    </span>
  );
}
