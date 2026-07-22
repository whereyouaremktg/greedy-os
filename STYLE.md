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
| `PageHeader` | `components/nav/page-header.tsx` | Sticky title block with optional description, right-aligned actions, and children (typically Tabs) below. Used by every module view. |
| `Topbar` | `components/nav/topbar.tsx` | Breadcrumb, sync pill, search, avatar |
| `Sidebar` | `components/nav/sidebar.tsx` | 32px items, sync indicator, footer |
| `KpiTile` | `components/dashboard/kpi-tile.tsx` | Sparkline, delta, animated number, status dot. Preserves `syncedAt` / `staleAfterMs` / `sub` / `status` API. |
| `CompoundKpiTile` | `components/dashboard/compound-kpi-tile.tsx` | Two-value tile (primary + secondary). Re-uses `KpiTile` status dot + tooltip helpers. |
| `AnimatedValue` | `components/dashboard/animated-value.tsx` | `@number-flow/react` wrapper |
| `KpiSparkline` | `components/dashboard/kpi-sparkline.tsx` | 14-day Recharts area, no axes |
| `ChannelMixCard` | `components/dashboard/channel-mix-card.tsx` | DTC vs Wholesale revenue split with bar, totals, deltas, stacked chart. Empty state when QB classes not synced. |
| `ChannelRevenueChart` | `components/dashboard/channel-revenue-chart.tsx` | Stacked DTC + Wholesale 30-day area (Recharts) |
| `EmptyState` | `components/empty-state.tsx` | Zero-data surfaces |
| `CommandPalette` | `components/command/command-palette.tsx` | `cmdk` + global `⌘K` |
| `ThemeToggle` | `components/theme-toggle.tsx` | Light ↔ dark cycle |
| `ChatPanel` | `components/chat/chat-panel.tsx` | Right rail, suggested prompts, streaming dots |
| `NumberInline` | `components/chat/number-inline.tsx` | Monospace tabular numbers in chat |
| `StreamingDots` | `components/chat/streaming-dots.tsx` | Subtle typing indicator |
| `ToolChip` | `components/chat/tool-chip.tsx` | Inline chip rendered while the analyst calls a tool. |
| `ViewTransitionWrapper` | `components/providers/view-transition-wrapper.tsx` | Page cross-fade; respects reduced motion |
| `PoView` | `components/purchase-orders/po-view.tsx` | Client shell for Purchase Orders: header, board/list tabs, upload + review + detail sheets. |
| `PoBoard` | `components/purchase-orders/po-board.tsx` | Drag-and-drop column board for active POs. |
| `PoListTable` | `components/purchase-orders/po-list-table.tsx` | Full list view of all POs. Buyer monograms, semantic status pills, urgency-aware cancel dates (red/amber only when overdue/≤7d). |
| `PoStatusBadge` | `components/purchase-orders/po-status-badge.tsx` | Dot + tinted pill per PO pipeline stage (neutral → brand → sky → violet → teal → emerald). `poStatusDotClass` exported for board column headers. |
| `PoDetailSheet` | `components/purchase-orders/po-detail-sheet.tsx` | Right Sheet for editing a single PO + payments. |
| `PoReviewDialog` | `components/purchase-orders/po-review-dialog.tsx` | Reviews a parsed PO before insert. |
| `PoUploadDropzone` | `components/purchase-orders/po-upload.tsx` | PDF / image dropzone that parses a PO with the LLM. |
| `ManufacturingView` | `components/manufacturing/manufacturing-view.tsx` | Client shell for Manufacturing: header, board/list tabs, upload + run form + delete confirm. |
| `ManufacturingBoard` | `components/manufacturing/manufacturing-board.tsx` | Drag-and-drop column board of runs by stage. |
| `ManufacturingTable` | `components/manufacturing/manufacturing-table.tsx` | Tabular run list with delete affordance. |
| `MoUploadDropzone` | `components/manufacturing/mo-upload.tsx` | Factory proforma upload + parse. |
| `MoReviewDialog` | `components/manufacturing/mo-review-dialog.tsx` | Confirm parsed proforma before creating a run. |
| `RunForm` | `components/manufacturing/run-form.tsx` | Create / edit manufacturing run form. |
| `LandedMarginPanel` | `components/costing/landed-margin-panel.tsx` | Landed-margin breakdown shown inside the run edit Sheet. |
| `RunCostingCallout` | `components/costing/run-costing-callout.tsx` | Costing summary callout used in run UIs. |
| `CampaignsView` | `components/campaigns/campaigns-view.tsx` | Client shell for Campaigns: header, summary, task board / list tabs, create + edit + delete. |
| `CampaignSummary` | `components/campaigns/campaign-summary.tsx` | Inline status row above the campaign tabs. |
| `CampaignTaskBoard` | `components/campaigns/campaign-task-board.tsx` | Drag-and-drop task board across campaigns. |
| `CampaignTable` | `components/campaigns/campaign-table.tsx` | Tabular campaign list. |
| `CampaignDetailSheet` | `components/campaigns/campaign-detail-sheet.tsx` | Right Sheet for editing a single campaign + tasks + links. |
| `CampaignForm` | `components/campaigns/campaign-form.tsx` | Create / edit campaign form (seeds starter checklist per type). |
| `TimelineView` | `components/timeline/timeline-view.tsx` | Shell for the Timeline tabs (Horizon / Month / Agenda) with shared filters + stats. |
| `TimelineHorizon` | `components/timeline/timeline-horizon.tsx` | Horizontal lane view across months. |
| `TimelineMonth` | `components/timeline/timeline-month.tsx` | Calendar-grid month view. |
| `TimelineAgenda` | `components/timeline/timeline-agenda.tsx` | Vertical agenda list grouped by date. |
| `TimelineEventRow` | `components/timeline/timeline-event-row.tsx` | Single-line event row used by Agenda / list contexts. |
| `TimelineEventDetailSheet` | `components/timeline/timeline-event-detail-sheet.tsx` | Right Sheet for a selected timeline event. |
| `ProductTable` | `components/products/product-table.tsx` | Products page shell: header, table, create/edit Sheets, Shopify sync. |
| `ProductForm` | `components/products/product-form.tsx` | Create / edit product form. |
| `ProductCombobox` | `components/products/product-combobox.tsx` | Searchable product picker for run / line-item forms. |
| `ConnectorCard` | `components/settings/connector-card.tsx` | Generic credential card on Settings. |
| `QuickbooksCard` | `components/settings/quickbooks-card.tsx` | QuickBooks OAuth-aware variant of the connector card. |
| `QbResultToast` | `components/settings/qb-result-toast.tsx` | Reads `?qb=...` query params and surfaces a toast after redirect. |
| `SlackIdentitiesCard` | `components/settings/slack-identities-card.tsx` | Maps Slack identities to Glow OS auth users. |
| `ReviewDialogShell` | `components/documents/review-dialog-shell.tsx` | Shared chrome for the PO / MO review dialogs. |

## Format helpers

`lib/format.ts` — `formatUsd`, `formatCount`, `formatPercent`, `formatRelativeTime`.  
Re-exported from `lib/dashboard/metrics.ts` for backwards compatibility.

## Reference bar

Match density and restraint of Linear, Vercel Dashboard, Attio, Causal — not literal clones.

## Do not

- Add UI libraries beyond shadcn + Tailwind v4. `@base-ui/react` is allowed only as shadcn's underlying headless layer; do not import it directly into product code.
- Use drop shadows that scream or bouncy animations.
- Change existing metric return field names.
- Enable system theme follow (explicit user toggle only).
