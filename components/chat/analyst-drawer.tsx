"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type AnalystDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const AnalystDrawerContext = createContext<AnalystDrawerContextValue | null>(
  null,
);

export function useAnalystDrawer() {
  const ctx = useContext(AnalystDrawerContext);
  if (!ctx) {
    throw new Error(
      "useAnalystDrawer must be used within AnalystDrawerProvider",
    );
  }
  return ctx;
}

/**
 * Non-throwing variant for callers that may render outside the provider
 * (e.g. the global command palette, which mounts under the root layout).
 * Returns `null` when no provider is mounted.
 */
export function useAnalystDrawerOptional(): AnalystDrawerContextValue | null {
  return useContext(AnalystDrawerContext);
}

function AnalystDrawerSheet() {
  const { open, setOpen } = useAnalystDrawer();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] flex flex-col p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Analyst</SheetTitle>
          <SheetDescription>
            Ask about cash, AR, revenue, pipeline, or ops data.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          <ChatPanel variant="drawer" />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AnalystDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <AnalystDrawerContext.Provider value={value}>
      {children}
      <AnalystDrawerSheet />
    </AnalystDrawerContext.Provider>
  );
}
