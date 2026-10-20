"use client";

import { useState } from "react";

/**
 * Run `onChange` synchronously during render the first time `prop` is a new
 * value (by identity). This is React's documented way to adjust local state
 * when a prop changes — it replaces the `useEffect(() => setX(prop), [prop])`
 * pattern, which re-renders twice and is flagged by react-hooks lint.
 */
export function useOnPropChange<P>(prop: P, onChange: (next: P) => void): void {
  const [prev, setPrev] = useState(prop);
  if (prop !== prev) {
    setPrev(prop);
    onChange(prop);
  }
}
