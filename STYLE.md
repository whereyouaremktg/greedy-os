# Glow OS — Style Guide

Future agents: read this before adding UI.

## Twelve principles

1. **Light mode is default.** Dark is equally polished, not an afterthought.
2. **Density over decoration.** Operator-tool spacing (32px nav rows, 13px labels, tight tables).
3. **Color restraint.** Brand accent for emphasis; semantic tokens for status. No loud gradients except chart fills.
4. **Motion with purpose.** Cross-fade page transitions, rolling numbers, pulse sync dots — no bouncy easing.
5. **Numbers are first-class.** Use `.num` / `tabular-nums` everywhere a figure appears.
6. **Status at a glance.** KPI tiles use corner dots (live / stale / pending); badges only when `status` is explicit without `syncedAt`.
7. **Keyboard-first.** `⌘K` / `Ctrl+K` command palette for navigation and actions.
8. **Skeletons, not spinners.** Route-level `loading.tsx` mirrors final layout.
9. **Empty states are actionable.** `EmptyState` with title, description, optional action.
10. **Extend, don't replace.** Compose shadcn/ui + Tailwind v4; no extra UI libraries.
11. **Preserve data contracts.** Do not rename fields in `lib/dashboard/metrics.ts`; only add optional fields.
12. **No emojis in UI copy.**

## Design tokens (`app/globals.css`)

| Token | Purpose |
|---|---|
| `--brand` | Glow peach/gold accent (~hsl 30–32° 58–65% 55–58%) |
| `--success` | Live / healthy (emerald) |
| `--warning` | Stale / delayed (amber) |
| `--danger` | Alert / negative delta (rose) |
| `--background`, `--foreground` | Warm zinc neutrals (light) / near-black (dark) |
| `--sidebar-accent` | Active nav tint (brand @ 8–10% opacity) |

Utility: `.num` — tabular numerals + tight tracking.

Fonts: **Geist Sans** (body), **Geist Mono** (code / tooltips).  
`font-feature-settings: "tnum" 1, "cv11" 1` on `body`.

## Theme contract

- `next-themes`: `defaultTheme="light"`, `attribute="class"`, `enableSystem={false}`, `disableTransitionOnChange`.
- Toggle: `components/theme-toggle.tsx` in sidebar footer; stable placeholder until mounted.
- Command palette includes "Toggle theme" action.

## Component inventory

| Component | Path | Notes |
|---|---|---|
| `KpiTile` | `components/dashboard/kpi-tile.tsx` | Sparkline, delta, animated number, status dot. Preserves `syncedAt` / `staleAfterMs` / `sub` / `status` API. |
| `AnimatedValue` | `components/dashboard/animated-value.tsx` | `@number-flow/react` wrapper |
| `KpiSparkline` | `components/dashboard/kpi-sparkline.tsx` | 14-day Recharts area, no axes |
| `ChannelMixCard` | `components/dashboard/channel-mix-card.tsx` | DTC vs Wholesale revenue split with bar, totals, deltas, stacked chart. Empty state when QB classes not synced. |
| `ChannelRevenueChart` | `components/dashboard/channel-revenue-chart.tsx` | Stacked DTC + Wholesale 30-day area (Recharts) |
| `EmptyState` | `components/empty-state.tsx` | Zero-data surfaces |
| `CommandPalette` | `components/command/command-palette.tsx` | `cmdk` + global `⌘K` |
| `ThemeToggle` | `components/theme-toggle.tsx` | Light ↔ dark cycle |
| `Topbar` | `components/nav/topbar.tsx` | Breadcrumb, sync pill, search, avatar |
| `Sidebar` | `components/nav/sidebar.tsx` | 32px items, sync indicator, footer |
| `ChatPanel` | `components/chat/chat-panel.tsx` | Right rail, suggested prompts, streaming dots |
| `NumberInline` | `components/chat/number-inline.tsx` | Monospace tabular numbers in chat |
| `StreamingDots` | `components/chat/streaming-dots.tsx` | Subtle typing indicator |
| `ViewTransitionWrapper` | `components/providers/view-transition-wrapper.tsx` | Page cross-fade; respects reduced motion |

## Format helpers

`lib/format.ts` — `formatUsd`, `formatCount`, `formatPercent`, `formatRelativeTime`.  
Re-exported from `lib/dashboard/metrics.ts` for backwards compatibility.

## Reference bar

Match density and restraint of Linear, Vercel Dashboard, Attio, Causal — not literal clones.

## Do not

- Add UI libraries beyond shadcn + Tailwind v4.
- Use drop shadows that scream or bouncy animations.
- Change existing metric return field names.
- Enable system theme follow (explicit user toggle only).
