import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glow OS",
  description: "Read-only command center for Glow operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-full font-sans">
        <AppProviders>{children}</AppProviders>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
