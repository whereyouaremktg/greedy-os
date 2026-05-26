"use client";

import * as React from "react";

import { formatRelativeTime } from "@/lib/format";

function subscribe(onStoreChange: () => void) {
  const id = window.setInterval(onStoreChange, 30_000);
  return () => window.clearInterval(id);
}

function getSnapshot() {
  return Date.now();
}

function getServerSnapshot() {
  return 0;
}

export function RelativeTime({ iso }: { iso: string }) {
  const now = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  if (!now) return <span>—</span>;
  return (
    <span>{formatRelativeTime(now - new Date(iso).getTime())}</span>
  );
}

function subscribeReduced(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReduced,
    getReducedSnapshot,
    () => false,
  );
}
