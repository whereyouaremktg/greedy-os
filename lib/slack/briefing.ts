import "server-only";

import { generateText } from "ai";

import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_DIGEST_MODEL } from "@/lib/ai/model";
import { contextBlock, dividerBlock, sectionBlock } from "@/lib/slack/blocks";
import type { Block } from "@slack/web-api";

// Paul's morning-briefing voice (rev 2, July 2026: no emoji, urgency-tiered,
// each entity appears once). The "# DATA" section is delivered as the user
// message, not part of the system prompt. Edit deliberately — the output
// voice is the product here.
export const BRIEFING_SYSTEM = `# ROLE
You are the morning briefing writer for Glow Beauty (ecommerce + wholesale haircare).
Every morning you turn raw ERP data — purchase orders, manufacturing orders, statuses,
ETAs, and email/thread notes — into ONE Slack message that a busy operator actually wants
to read. Think sharp chief-of-staff, not a database export.

# YOUR JOB
Turn the structured data at the bottom into a Slack post that is skimmable in 15 seconds,
leads with what needs action, and reads like a smart human wrote it — never a data dump.

# SLACK FORMATTING (follow exactly — this is mrkdwn, NOT standard Markdown)
- Bold = *single asterisks*. NEVER use **double asterisks** — Slack prints them literally.
- Italic = _underscores_. IDs / PO numbers = \`backticks\`.
- No \`#\` headings — Slack ignores them. A section header is one short *bold* line.
- Bullets: start each line with "• " (a real bullet). One item per line.
- NEVER chain facts with semicolons into a run-on. One idea per line.
- ABSOLUTELY NO EMOJI, icons, colored circles, or decorative symbols — none, anywhere.
  Urgency is carried by placement and wording, never by symbols.
- Links: <https://url|label>. Keep every line under ~2 wrapped lines; if longer, cut it.

# VOICE
- Concise, warm, active voice. Short declarative sentences.
- Plain English, not ERP-speak: "ETA no date" → "no ETA yet".
- If a note carries 5 facts, keep only the one that matters today. Drop the changelog.
- Never invent data. If a field is missing, say so plainly or omit it. No hype, no filler.
- Read like a Bloomberg terminal note, not a group chat.

# SEVERITY → PLACEMENT
Each row carries severity: "action" | "watch" | "ok".
Every entity appears EXACTLY ONCE, in the highest section it qualifies for. Never repeat
an item across sections — the old both-places habit is exactly what we're killing.

# STRUCTURE (exactly this order)
1. *Glow OS — {Weekday, Mon D}* on its own line, then a dim vitals line:
   _Sales thru {date} · Cash thru {date} · {N} POs monitored · {N} emails in needs-review_
2. *Needs attention* — the "action" rows, most urgent first (lapsed deadlines before
   approaching ones). Each bullet: *{Vendor}* \`{PO/product}\` — the situation in one
   clause, then the concrete next step with who and the deadline. 1–5 bullets.
   If none, write: Nothing urgent today.
3. *Watching* — the "watch" rows, one terse line each:
   *{Vendor}* \`{PO/product}\` — {status} · {ETA} · the single open thing, if any.
   No commentary beyond that. Skip the section entirely if empty.
4. *On track* — ONE rolled-up line for all "ok" rows: names with ETAs, comma-separated
   ("ANTHRO \`4811\` (Aug 7), JillyBox \`PO 1\` (Dec 9)"). Skip if empty.
5. Footer: one dim line — _{date} · {N} runs · {N} POs monitored · {N} emails in needs-review_

Separate sections with a line containing only "---" (it renders as a divider).

# RULES OF THUMB
- Dates always as "Mon D" (Jul 20). Late ones: "ETA Jun 23 — passed", bold only the
  deadline phrase that demands action today.
- Lead with the exception. The reader should be able to stop after "Needs attention"
  and miss nothing that matters today.
- Collapse a note history into: current state + the next action.`;

/** Structured facts for one monitored entity, model-facing. */
export type BriefingRow = {
  kind: "manufacturing_run" | "purchase_order";
  /** Plain words, deliberately not emoji — the model must never see circles. */
  severity: "action" | "watch" | "ok";
  vendor: string;
  item: string;
  status: string;
  /** ISO date or null. */
  eta: string | null;
  /** Attention flags from the radar assessment ("ETA 06/23 passed", …). */
  flags: string[];
  /** Field changes the inbound agent applied today. */
  appliedToday: string[];
};

export type BriefingData = {
  /** e.g. "Tuesday, Jul 22" — computed server-side so the model never does date math. */
  weekday: string;
  /** ISO dates for the vitals line; null = that source has never synced. */
  salesThru: string | null;
  cashThru: string | null;
  needsReviewEmails: number;
  runs: BriefingRow[];
  pos: BriefingRow[];
};

/**
 * Claude occasionally slips into standard Markdown despite the prompt; fix
 * the failure modes that render as literal noise in Slack. The brief is
 * emoji-free by design (rev 2) — strip any that leak through, then tidy
 * whitespace the removal leaves behind.
 */
export function sanitizeMrkdwn(text: string): string {
  return text
    .replace(/^```(?:\w+)?\n?/, "")
    .replace(/\n?```\s*$/, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<$2|$1>")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
    .replace(/(\S) {2,}/g, "$1 ")
    .trim();
}

export async function composeBriefing(data: BriefingData): Promise<string> {
  const prompt = `Today is ${data.weekday}. Use exactly this date in the header and footer — never derive today's date from the data (sales can sync a day ahead in UTC).

# DATA
${JSON.stringify(data, null, 2)}`;

  const result = await withModelFallback(GLOW_DIGEST_MODEL, (model) =>
    generateText({ model, system: BRIEFING_SYSTEM, prompt }),
  );

  const text = sanitizeMrkdwn(result.text);
  if (!text) throw new Error("composeBriefing: model returned empty text");
  return text;
}

/** Slack caps section blocks at 3000 chars — split on line boundaries. */
const SECTION_LIMIT = 2900;

/**
 * mrkdwn text → Slack blocks. Standalone `---` lines become real divider
 * blocks (Slack renders literal dashes otherwise), standalone fully-italic
 * lines become dim context blocks (the "vitals"/footer lines in the brief),
 * everything else accumulates into section blocks under the size cap.
 */
export function briefingBlocks(text: string): Block[] {
  const out: Block[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) out.push(sectionBlock(current));
    current = "";
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (/^-{3,}$/.test(trimmed) || /^[*_]{3,}$/.test(trimmed)) {
      flush();
      out.push(dividerBlock());
      continue;
    }
    if (/^_[^_]+_$/.test(trimmed)) {
      flush();
      out.push(contextBlock(trimmed));
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > SECTION_LIMIT) {
      flush();
      current = line;
    } else {
      current = candidate;
    }
  }
  flush();

  // Slack rejects messages with zero blocks; never return empty.
  return out.length > 0 ? out : [sectionBlock(text.slice(0, SECTION_LIMIT))];
}
