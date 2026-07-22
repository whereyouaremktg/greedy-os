# Wholesale Sell-Through Tracking — Revolve now, URBN next

**Status: planned (not started). Locked via multi-agent design review, 2026-07-02.**
Sample report: Revolve style sell-through CSV (9 SKUs, brush line), received periodically by email.

## Why / what this is

Revolve and Anthropologie/Urban (URBN) are the two huge wholesale accounts. Glow OS already
tracks **sell-in** (what we shipped them: `purchase_orders` + `po_line_items`, vendors=buyers)
but has **zero visibility into sell-through** (what they actually sold to consumers, their
on-hand inventory, markdowns, returns). Revolve's periodic CSV reports carry exactly that.
This module ingests those reports and turns them into per-partner YTD dashboards that sit
directly beside the sell-in data.

## How it fits the existing ERP (verified against the codebase)

- `vendors` already holds the retail partners (REVOLVE, ANTHROPOLOGIE rows exist — the table
  mixes buyers and manufacturers despite its "suppliers" label). The partner **is** the
  existing vendors row; no new counterparty concept.
- `purchase_orders` = outbound wholesale orders → the sell-in side of the reconciliation.
  Revolve PO lines carry GUTR-* codes in `po_line_items.sku` (`revolve_code ?? style_number`,
  lib/purchase-orders/schema.ts).
- **No UPC/barcode column exists anywhere** — `products.sku` (OG-001…) can't match the
  report's Manufacturer No. (860012054701). We add `products.upc`.
- **No CSV ingestion exists anywhere** — DOCUMENT_ACCEPT is png/jpeg/webp/pdf; all existing
  parsing is LLM (Gemini Flash). This feature is deterministic TypeScript parsing (machine-
  generated CSV; no LLM), a new small pipeline, not a widening of the doc pipeline.
- Reuses house machinery: upload→review→commit staging (PO upload pattern), ReviewDialogShell,
  right-side detail Sheets (no [id] routes anywhere), Recharts, KpiTile, Postmark inbound
  webhook pattern (po-email clone), `findOrCreateVendorByName`, `sendSlack` deduped pings.

## Core design: a partner snapshot ledger

Each accepted report file = one **immutable snapshot** (`wholesale_reports` row with raw CSV
text + per-line raw jsonb preserved) + normalized `wholesale_report_lines`. All YTD math is
**deltas between CUM columns of two snapshots** — never Σ of SP (period) columns, whose
window is irregular and unverifiable.

Idempotency, three layers:
1. unique `file_sha256` (discarded reports release the hash) — same file can't stage twice;
2. partial unique `(vendor_id, report_date) WHERE status='committed'` — same-day
   double-commit becomes an explicit **supersede** flow;
3. metrics read cumulative *levels*, so even a mis-dated duplicate can't double-count units.

### Report semantics — verified against the sample (do not re-litigate)

- **`Total Unit Sales (CUM)` is lifetime units NET of returns.** Proof: reported
  `Return Rate (CUM)` = `returns_cum / (units_cum + returns_cum)` exactly on every line
  (69/(1820+69)=3.65%, 61/(1535+61)=3.82%, 23/(146+23)=13.61%). So: YTD units (net) = ΔCUM
  is the primary metric; YTD returns = Δreturns_cum; **gross** = net + returns. Never
  compute "net = units − returns" (double-subtracts).
- **The Total row is half garbage, half useful.** Its Manufacturer No. is int-overflow
  (2147483647) — skip the row. Its *percentage* columns are averages/raw sums of line
  percentages (Total ST% 68.19 = mean of line ST%s; GM(SP) 540.57% = sum) — never checksum
  or display them. Its *unit/$* columns are exact sums — **use as parse checksums**:
  sample ⇒ 9 data lines, Σ units_sp = 402, Σ units_cum = 5,511, Σ sales_sp = $12,807.43.
- **The CSV carries no as-of date.** report_date is human-confirmed at commit (email path
  prefills from the email Date header). This field orders the snapshot timeline — it's the
  one human-error risk, hence human commit, backdate warnings, and same-day uniqueness.
- **Our partner-level ST% will not match Revolve's Total row** (we compute weighted
  Σcum/(Σcum+Σon_hand) ≈ 72.06% on the sample vs their averaged 68.19%). Tooltip required:
  "weighted; Revolve's Total row averages line percentages" — or it looks like our bug in
  a buyer meeting.
- **WSTI is opaque** (values don't reproduce from any weeks-of-supply formula in the file).
  Render verbatim labeled "(Revolve)", never aggregate it (Total row's 11.80 is meaningless).
  We derive our own WOS from snapshot pairs alongside it.
- UPC prefixes vary legitimately (850… and 860… ranges in the same file) — don't validate
  prefixes, only digit shape.

## Data model — migration `0023_wholesale_sell_through.sql`

(0022 is taken by the inbound-email `inbound_messages` work — use 0023. Apply via dashboard SQL editor / ad-hoc pg script;
hand-add to types/db.ts — OWNED-class tables, typed server actions use them.)

- `ALTER TABLE products ADD COLUMN upc text;` + partial unique index. Per-colorway product
  rows (OG-001…OG-014) line up 1:1 with report lines, so one upc per product suffices.
- `wholesale_reports`: vendor_id FK, `format` text ('revolve_csv_v1'), `parser_version`,
  `report_date` (nullable while pending; required to commit), `status`
  ('pending_review'|'committed'|'superseded'|'discarded'), `source` ('upload'|'email'),
  `inbound_message_id`, `file_name`, `file_sha256`, **`raw_csv` text (verbatim original —
  audit + deterministic re-parse; fixes the PO pipeline's originals-discarded gap)**,
  `raw_headers text[]`, row/skipped/matched counts, created_by, timestamps, set_updated_at
  trigger, shared-state OWNED RLS. Uniques as above.
- `wholesale_report_lines`: report_id FK CASCADE, line_no, **`raw jsonb` (original row)**,
  partner_sku (Revolve No.), upc (normalized digits), product_name, color, launch_date,
  weeks_on_site; SP flows (units total/FP/MD, returns, sales $, cogs $, GM%) — display and
  reconciliation only; CUM levels (**`units_sold_cum` — nullable in DDL, required by the
  Revolve parser**; returns_cum, GM cum %, return rate cum %); state (on_hand, on_order,
  preorders, inventory_cost, ST% lifetime, wsti, current/retail price, unit costs, RA units);
  product_id FK SET NULL + match_source ('upc'|'manual'|NULL). One line per product key per
  report (partial uniques on (report_id, upc) / (report_id, partner_sku)).
- `ALTER TABLE inbound_email_log ADD COLUMN wholesale_report_id uuid` (email idempotency join).

Keep `units_sold_cum` **nullable in DDL** with per-format enforcement in the parser: a future
URBN format may lack a true CUM column (its parser would derive it at stage time and flag
`derived_cum`) — strictness belongs in the Revolve parser, not the DDL.

## Ingestion — two paths, one pipeline (`stageWholesaleReport` in lib/wholesale/core.ts)

**A) Upload (v1, primary):** "Upload report" on /wholesale → dropzone Sheet (.csv only via a
new `WHOLESALE_ACCEPT` const — do NOT widen the shared `DOCUMENT_ACCEPT`) → POST
`app/api/wholesale/parse/route.ts` (nodejs runtime, auth-gated, clone of the PO parse route
**except it stages server-side at first touch** — deliberate deviation so raw_csv persists and
the sha256 unique fires immediately).

Parse pipeline (deterministic, zero LLM):
1. sha256; 10MB/text checks.
2. `lib/wholesale/csv.ts` — ~50-line RFC-4180 parser (quoted "$5,201.88" / "5,511" fields).
3. `detectWholesaleFormat(headers)` — plain if/else on concrete header signatures. Unknown →
   **422 echoing the header list** + copy: "Unrecognized report format — save this file as a
   sample so a parser can be added." (That 422 IS the URBN intake mechanism.)
4. `parsers/revolve.ts` — money/pct/int normalizers; skip Total row (Name==='Total' or
   upc==='2147483647'); per-line CUM required; dup-key 422 naming rows. **Excel-mangle
   defense:** if dates no longer match ^\d{4}-\d{2}-\d{2}$ or UPCs aren't 12–13 digits, the
   file was probably opened+resaved in Excel → review-dialog warning.
   **Total-row checksum:** assert Σ line units_sp/units_cum equal the Total row, Σ sales_sp
   within $1 → mismatches become review warnings (unit/$ columns only, never percentages).
5. Match pass (below).
6. Stage: vendor pinned by format (**invariant: 'revolve_csv_v1' → 'REVOLVE' via
   findOrCreateVendorByName; never derive the vendor from report content** — name variants
   would fork the partner). Header insert + batch line insert + compensating delete on
   failure (no transactions in this codebase). Duplicate sha → friendly "already uploaded"
   deep-link; **if the duplicate is pending_review, offer "resume review"** (else an
   abandoned tab permanently locks the file — alternatively auto-expire pending > 14 days
   to discarded).

**Review → commit:** `ReportReviewDialog` (ReviewDialogShell): partner select, **report_date
required** (prominent — no date in the CSV), match summary, unmatched pickers, warnings:
same-day committed report → supersede flow; backdated vs latest snapshot → confirm; **report
dated within ~14 days after Jan 1 → year-straddle warning** (its SP window likely spans the
year boundary, affecting the Σ-SP dollar figure only). Discard frees the sha. Pending reports
stay visible in the Reports tab.

**Safe re-parse:** `reparseWholesaleReport` re-runs the current parser over stored raw_csv,
delete+reinsert lines, re-match, bump parser_version, preserve status/date. Parser bug fixes
heal data retroactively without re-obtaining files.

**B) Email forward (later phase):** `app/api/inbound/wholesale-report/route.ts` cloning the
po-email webhook (token, sender allowlist, inbound_email_log MessageID idempotency, fast ACK
+ waitUntil): first CSV attachment → same pipeline, source='email', report_date prefilled
from the email Date header, **status stays pending_review — no auto-commit** (a mis-dated
committed snapshot silently corrupts YTD ordering; unlike a PO it's not fixable post-hoc).
Slack ping dedupeKey `wholesale-report:{id}`: "Revolve sell-through report received (N rows,
M unmatched) — Review".

## SKU matching

- `normalizeUpc`: digits only, strip leading zeros for comparison (UPC-A vs EAN-13 padding).
- Auto-match **only** on `products.upc` equality. Name-similarity (à la `matchProductId` in
  lib/manufacturing/from-parsed.ts) produces *suggestions* in the picker, never auto-commits.
- **Unmatched rows are first-class, not errors**: they stage, commit, and count fully in
  partner totals (delta math keys on upc/partner_sku, not product_id); absent only from
  per-product rollups. Sidebar NavCounter (tone 'warning') = unmatched-line count — in scope.
- Resolution learns: `assignLineProduct` sets product_id + writes the upc back to products
  (guarded both directions: product already has a *different* upc, OR **upc already on
  another product** — surface friendly conflicts, not a 23505), then relinks other unmatched
  lines with the same upc across reports. ~10 SKUs ⇒ converges after one report.
- Optional later: extend the Shopify catalog sync to pull `ProductVariant.barcode` into
  empty `products.upc`.
- Sell-in join is a second, independent key: `lines.partner_sku ↔ po_line_items.sku`
  (GUTR-* codes) — display/reconciliation only, never for product_id resolution.

## Metrics (lib/wholesale/metrics.ts) — the correctness contract

Per (partner, key k, year Y), over **committed** reports only:
- `latest(k)` = line for k from max(report_date) among reports *containing k* (per-key latest
  — a delisted SKU that drops off newer exports keeps its last CUM instead of reverting).
- `baseline(k, Y)` = line from the most recent report dated < Jan 1 of Y; absent → 0.
- **YTD units sold (net of returns, primary)** = Δ units_sold_cum.
- **YTD returns** = Δ returns_cum. **Gross YTD** = net + returns.
- **Return rate (lifetime)** = returns_cum / (units_cum + returns_cum) — Revolve's own
  formula; cross-check vs their reported figure, flag if >0.5pt off.
- **Sell-through % (lifetime)** = pass through Revolve's figure; derived
  cum/(cum+on_hand) in tooltip (with the "weighted vs averaged" caveat above).
- **WOS**: derived = on_hand ÷ weekly rate from the last two snapshots containing k (needs
  ≥2 snapshots, else '—'); WSTI shown verbatim "(Revolve)", never aggregated.
- **Velocity** = units_cum ÷ weeks_on_site, per-product column (the ranking buyers actually
  discuss: Classic ≈38.2/wk vs BetterGreen ≈17.7/wk on the sample).
- **YTD $** (Revolve provides no CUM dollars): (a) Σ sales_usd_sp over committed reports in
  Y — the only place SP is summed, labeled "as reported — assumes no missed reports; window
  boundaries approximate at year edges"; (b) est. retail value = YTD units × retail price.
  Units are primary; dollars are annotated approximations.
- **Always-on coverage guard**: compute ΣSP-vs-ΔCUM divergence per partner-year; >2% → amber
  "possible missing or re-issued report" badge on the partner card.
- **Sell-in YTD** = Σ po_line_items qty/line_total for the vendor, order_date in Y, status
  NOT IN ('draft','cancelled') (same exclusions as getPoWholesaleRevenue). Reconciliation
  per key: sell-in − sell-through(net) − returns vs on_hand — persistent gap ⇒ missed
  reports, unrecorded POs, or RTV.
- **CUM regression** (partner restated data): flag on report detail, **display the line's
  RA Units next to it** (return authorizations often explain restatements); never clamp.
- **First-year honesty**: no committed snapshot dated before Jan 1 ⇒ every tile reads
  "since first snapshot (<date>)", not "YTD". The label travels with the number everywhere
  (including the AI analyst later). Becomes true YTD automatically once a year-boundary
  snapshot exists.

## UI — new module `app/(app)/wholesale/` ("Sell-Through")

Single route, Sheets for depth (house pattern; no [id] routes). Register: Sidebar NAV
(icon TrendingUp, counter 'wholesale'), command-palette PAGES + '?new=1' upload action,
topbar ROUTE_LABELS. RSC page → `<WholesaleView>` client shell (PageHeader + Tabs).

- **Partners tab** (Revolve first): KpiTile row — YTD units (net), YTD returns/rate, on-hand
  @partner + inventory cost, lifetime ST%, WOS; footer "Latest snapshot Xd ago". Snapshot
  AreaChart (clone channel-revenue-chart.tsx) of cumulative units + on-hand over report_date.
  **FP vs MD stacked area** (markdown share rising = earliest markdown-risk tell). Per-product
  table (forecast-table pattern): units, velocity, ST%, WOS/WSTI, returns, on-hand, price.
  **Sell-in vs sell-through card**: per product — YTD sell-in | sell-through | returns |
  on-hand | implied gap.
- **Reports tab**: all statuses (pending visible), report_date, partner, format, rows,
  unmatched, status pill, source. Row → ReportDetailSheet: meta (sha, parser_version),
  commit/discard/supersede/re-parse, data-quality callouts (CUM regressions + RA units,
  checksum mismatches, Excel-mangle warnings), unmatched-resolution pickers, full line table.

## Build phases

1. **Schema + types** — 0023 migration + hand-edit types/db.ts. *(build+lint+typecheck)*
2. **Parse + match + staging** — csv.ts, parsers/revolve.ts, parse.ts, match.ts, core.ts,
   schema.ts (zod OUT of the 'use server' file), /api/wholesale/parse. Acceptance vs the
   sample: **9 data lines, 1 skipped Total row, Σ units_sp=402, Σ units_cum=5,511,
   Σ sales_sp=$12,807.43**, checksums pass, normalizers exact.
3. **Actions + module UI** — lib/actions/wholesale.ts, page + loading skeleton,
   components/wholesale/*, nav/palette/topbar registration. Commit the sample end-to-end.
4. **Metrics + partner dashboard + sell-in tie** — metrics.ts engine, Partners tab,
   reconciliation card, coverage guard, NavCounter.
5. **Historical backfill** — pull prior Revolve report emails from the inbox, ingest
   oldest-first via the upload path (review dialog already supports backdating). This is
   what turns "since first snapshot" into real YTD and gives WOS/velocity their ≥2-snapshot
   requirement on day one.
6. **Email-forward ingestion** — /api/inbound/wholesale-report webhook + Slack ping +
   Postmark rule; document in docs/INTEGRATIONS.md. Plus the **45-day stale nudge** added to
   the existing app/api/cron/slack-triggers route (dedupeKey
   `sellthrough-stale:{vendor_id}:{YYYY-MM}`) — push feeds don't fit the health system's
   freshness model; this sidesteps it without new cron infra.
7. **AI analyst integration** — sell-through context block in lib/ai/context.ts + a
   `getPartnerSellthrough` read tool in lib/ai/tools.ts so "how's Revolve doing YTD?" works
   in Slack/chat. Cheap, additive; the labels ("since first snapshot") must pass through.
8. **URBN parser — blocked on the first real URBN file.** parsers/urbn.ts + one detect
   branch; pre-aggregate per-door rows to satisfy one-line-per-key; derive CUM if URBN lacks
   it (flagged); map to ANTHROPOLOGIE (+ separate URBAN OUTFITTERS vendor if they report
   separately). The 422-with-headers response is the intake; nothing speculative before then.

## Risks (accepted)

- report_date is human-entered on upload (CSV has no date) — mitigated by email-header
  prefill, backdate/straddle warnings, same-day uniqueness, human commit.
- Dollar YTD is inherently approximate (no CUM $ column) — labeled, units are primary.
- Partner restatements make CUM regress — flagged with RA units shown, never auto-corrected.
- No DB transactions: stage/re-parse use compensating deletes; raw_csv makes any state
  recoverable.
- types/db.ts hand-maintained — drift surfaces at runtime; keep edits minimal and typed.
- Per-product sell-in join rides on po_line_items.sku carrying GUTR-* codes (true for
  existing Revolve POs, unenforced) — partner-level totals unaffected if it degrades.

## Open questions for Paul (answers change the plan)

1. **Report date/cadence**: does the Revolve email state the as-of date or period? Is each
   SP window exactly "since the previous report", and have any emails ever been missed?
   (Decides how much the Σ-SP dollar figure can be trusted, and how safe email-date prefill is.)
2. Does Revolve ever re-send a corrected report for the same period → should supersede be
   the default handling?
3. Confirm `Total Unit Sales (CUM)` is lifetime-since-launch (Age=333d rows suggest yes),
   not season-to-date.
4. YTD definition: calendar year, Jan 1? Primary number net (Revolve's figure) or gross?
5. **URBN delivery**: how do Anthro/UO reports arrive (email/portal), what file type, one
   combined URBN feed or two — one vendor row or two?
6. Backfill: how far back do the Revolve report emails go?
7. Shopify barcode backfill into products.upc, or key in UPCs via the picker (~10 SKUs)?
8. Slack: fold sell-through highlights (low-WOS callouts) into the daily digest later?
