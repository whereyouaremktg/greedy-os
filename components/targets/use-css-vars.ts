"use client";

import { useEffect, useState } from "react";

// Recharts writes colors as SVG presentation attributes, where `var(--x)` is
// not resolved. Read the theme tokens from the document instead and re-read
// when the theme class flips, so charts follow light/dark like everything else.
export function useCssVars<const T extends readonly string[]>(
  names: T,
): Record<T[number], string> {
  const [vars, setVars] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      const style = getComputedStyle(document.documentElement);
      const next: Record<string, string> = {};
      for (const name of names) next[name] = style.getPropertyValue(name).trim();
      setVars(next);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
    // names is a stable literal tuple at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return vars as Record<T[number], string>;
}
