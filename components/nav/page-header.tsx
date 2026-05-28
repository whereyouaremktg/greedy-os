import * as React from "react";

import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-3 backdrop-blur supports-backdrop-filter:bg-background/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
