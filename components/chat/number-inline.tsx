import { cn } from "@/lib/utils";

/** Inline numbers in chat copy — tabular-nums for alignment. */
export function NumberInline({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("num font-mono text-[0.92em]", className)}>
      {children}
    </span>
  );
}

/** Wrap dollar amounts and integers in assistant messages. */
export function enrichNumbers(text: string): React.ReactNode[] {
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?%?)/g);
  return parts.map((part, i) => {
    if (/^\$[\d,]+/.test(part) || /^[\d,]+%?$/.test(part)) {
      return <NumberInline key={i}>{part}</NumberInline>;
    }
    return part;
  });
}
