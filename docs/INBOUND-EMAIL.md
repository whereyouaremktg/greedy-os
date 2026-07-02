# Inbound email → PO/manufacturing monitoring agent

Shipped July 2026. Two monitored inboxes are CC'd on every vendor thread;
Postmark forwards each email into Glow OS; an agent threads it, links it to the
right manufacturing run or wholesale PO, extracts updates, auto-applies the safe
ones, and posts a daily 🔴🟡🟢 radar to Slack. Manufacturing is the priority
stream; wholesale reuses the same pipeline.

## Postmark wiring (the only manual setup)

Each monitored address gets a Postmark inbound server whose webhook points at
the matching stream endpoint, with the shared secret in the URL:

| Address | Webhook URL |
|---|---|
| `product@glowbeautyhair.com` (manufacturing) | `https://glow-os-bay.vercel.app/api/inbound/manufacturing-email?token=<INBOUND_EMAIL_SECRET>` |
| `receiving@glowbeautyhair.com` (wholesale) | `https://glow-os-bay.vercel.app/api/inbound/po-email?token=<INBOUND_EMAIL_SECRET>` |

`INBOUND_EMAIL_SECRET` is already set in Vercel production env (same token for
both). Enable "Include raw email content" is NOT needed; the default JSON
payload carries Headers + Attachments.

**Sender allowlist:** `INBOUND_EMAIL_ALLOWED_SENDERS` (comma-separated, exact
address or `@domain`), default `@glowbeautyhair.com`. Because the inbox is CC'd
on vendor threads, the FACTORY's replies arrive from the vendor's domain — add
vendor domains to the allowlist (or set the var to empty to allow all senders)
or only team-forwarded mail will be processed. A misrouted email is fine: a
lightweight classifier (`lib/inbound/classify.ts`) re-routes between streams.

## Pipeline (lib/inbound/)

`ingest.ts` (shared webhook handler) →
1. **Claim/dedupe** — insert into `inbound_messages` keyed on the RFC
   Message-ID (falls back to Postmark's MessageID). Webhook retries 23505 out.
2. **Store** — PDF/image attachments go to the private `inbound-attachments`
   Storage bucket; refs in `attachments` jsonb.
3. **Classify** (`classify.ts`) — heuristics (buyer names, factory vocabulary,
   known manufacturing vendors) + Gemini tie-break; keeps the webhook's stream
   unless clearly misrouted.
4. **Thread** (`thread.ts`) — thread_key from the References/In-Reply-To root
   Message-ID, else normalized subject + counterparty domain.
5. **Link** (`link.ts`) — inherit from an already-linked thread → PI/PO number
   match (PI numbers live in run notes) → unambiguous vendor with exactly one
   open order → create the run/PO from an attached proforma/PO document →
   else `needs_review`. Never guess-links across vendors.
6. **Extract** (`extract.ts`) — one structured Claude call (withModelFallback)
   over the FULL thread + current record. Returns summary / updates / missing /
   open_questions / risky_changes / confidence.
7. **Apply** — high-confidence safe updates only: dates, forward-only
   stage/status moves, tracking/carrier/ship date. Quantity + price changes and
   anything in risky_changes are NEVER auto-applied → `needs_review`.
   Provenance note appended to the run/PO on every applied change.
8. **Notify** — Slack ping per processed email (deduped per message).

## Daily radar

`/api/cron/po-monitor` (vercel.ts cron, 14:00 UTC daily — after the 13:00
digest). For every open run + open wholesale PO: re-runs the extraction agent
over its thread (idempotent apply), then posts one Slack message with a
**Manufacturing radar** (first) and **Wholesale radar** — one 🔴/🟡/🟢 line per
order with what changed, what's missing, and stall detection (no reply in 5+
days). Manual trigger:
`curl -H "Authorization: Bearer $CRON_SECRET" https://glow-os-bay.vercel.app/api/cron/po-monitor`

## UI

- **Correspondence** section on the manufacturing run edit sheet and the PO
  detail sheet: thread (subjects + snippets), the agent's latest summary,
  missing items / open questions, and an **Apply** button for suggested
  updates the agent didn't auto-apply (human click = sign-off; money/quantity
  still edited manually in the form).
- **Needs attention** banner on /manufacturing and /purchase-orders when
  emails are sitting in `needs_review`.

## Data

- `inbound_messages` (migration 0022 — note the SELL-THROUGH plan doc referred
  to "0022" for wholesale tables; that work should use **0023**). RLS enabled,
  authenticated read, service-role writes.
- `inbound_email_log` is legacy (old wholesale one-shot path) — kept for its
  audit history, no longer written to.

## Gotchas

- Postmark's top-level `MessageID` is internal; the RFC `Message-ID` (what
  replies reference) is in `payload.Headers`. We key on the RFC id.
- Local testing: `vercel env pull` returns sensitive values (secrets, Slack
  tokens) as EMPTY strings — override `INBOUND_EMAIL_SECRET` locally and
  expect Slack sends to fail (they're best-effort in the pipeline).
- The extraction prompt resolves fuzzy dates ("early August" → Aug 5); the
  apply path is idempotent (same value = skipped, no duplicate notes), which is
  what lets the daily radar re-run extraction safely.
