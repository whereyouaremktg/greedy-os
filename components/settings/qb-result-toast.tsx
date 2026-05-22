"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

// Reads ?qb=... after the OAuth flow lands back on /settings and shows a
// toast. Strips the params so a reload doesn't re-fire the toast.

const MESSAGES: Record<
  string,
  { type: "success" | "info" | "error"; text: string }
> = {
  connected: { type: "success", text: "QuickBooks connected." },
  "needs-client-id": {
    type: "info",
    text: "Add your Intuit Client ID and Secret before connecting QuickBooks.",
  },
  error: {
    type: "error",
    text: "QuickBooks connection failed. Check the URL for details.",
  },
};

export function QbResultToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current) return;
    const qb = params.get("qb");
    if (!qb) return;
    firedRef.current = true;
    const detail = MESSAGES[qb];
    if (detail) {
      const fn =
        detail.type === "success"
          ? toast.success
          : detail.type === "error"
            ? toast.error
            : toast.info;
      const qbErr = params.get("qb_error");
      fn(qbErr ? `${detail.text} (${qbErr})` : detail.text);
    }
    // Strip qb=* params so a refresh doesn't re-fire.
    const next = new URLSearchParams(params.toString());
    next.delete("qb");
    next.delete("qb_error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [params, pathname, router]);

  return null;
}
