"use client";

import { usePathname } from "next/navigation";

export function ViewTransitionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="view-transition-content animate-in fade-in duration-200"
    >
      {children}
    </div>
  );
}
