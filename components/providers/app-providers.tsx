"use client";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { CommandPaletteProvider } from "@/components/command/command-palette";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider delay={200}>
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
