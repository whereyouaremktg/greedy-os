import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function EmptyStateAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}
