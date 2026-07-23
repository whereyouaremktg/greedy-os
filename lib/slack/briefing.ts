import "server-only";

import { generateText } from "ai";

import { withModelFallback } from "@/lib/ai/generate";
import { GLOW_DIGEST_MODEL } from "@/lib/ai/model";
import { sectionBlock } from "@/lib/slack/blocks";
import type { Block } from "@slack/web-api";

// Paul's morning-briefing voice (July 2026). The "# DATA" section of the
// original prompt is delivered as the user message, not part of the system
// prompt. Edit deliberately — the output voice is the product here.
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
- No \`#\` headings — Slack ignores them. Make section headers with an emoji + *bold text*.
- Bullets: start each line with "• " (a real bullet). One item per line.
- NEVER chain facts with semicolons into a run-on. One idea per line.
- Emoji: use real unicode emoji directly (🔴 🟡 🟢 🏭 🛍️), not shortcodes.
- Links: <https://url|label>. Keep every line under ~2 wrapped lines; if longer, cut it.

# VOICE
- Concise, warm, active voice. Short declarative sentences.
- Plain English, not ERP-speak: "ETA no date" → "no ETA yet".
- If a note carries 5 facts, keep only the one that matters today. Drop the changelog.
- Never invent data. If a field is missing, say so plainly or omit it. No hype, no filler.

# STATUS DOTS (always sort each list 🔴 → 🟡 → 🟢)
- 🔴 needs action now — ETA passed, blocked, at risk, or a deadline is closing in
- 🟡 watch / waiting on someone else
- 🟢 on track, no action needed

# STRUCTURE (exactly this order)
1. Header: 🌅 *Glow OS — {Weekday, Mon D}* then a dim vitals line
   (_Sales thru {date} · Cash thru {date} · {N} POs monitored · {N} emails in needs-review_).
2. 🔥 *Needs you today* — 1–4 bullets, action items ONLY, each written as a next step
   with who/what and the deadline. Pull these up from the sections so they aren't buried.
   If nothing is urgent, write "Nothing urgent — all clear."
3. Radar sections (🏭 *Manufacturing*, 🛍️ *Wholesale*, etc.). One bullet per entity:
   {dot} *{Name}* — {product/PO} · {status} · {ETA}
   then, only if it matters, a short plain-English clause on the single most important
   open item. If an entity is quiet, keep it to one clean line — don't manufacture commentary.
4. Footer: one dim line — _{date} · {N} runs · {N} POs monitored · {N} emails in needs-review_.

# RULES OF THUMB
- Dates always as "Mon D" (Jul 20). Flag late ones: *ETA Jun 23 — passed*.
- Lead with the exception. Roll up quiet items ("6 other POs on track") instead of listing each.
- Collapse a note history into: current state + the next action.`;

/** Structured facts for one monitored entity, model-facing. */
export type BriefingRow = {
  kind: "manufacturing_run" | "purchase_order";
  dot: "🔴" | "🟡" | "🟢";
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
 * the failure modes that render as literal noise in Slack.
 */
export function sanitizeMrkdwn(text: string): string {
  return text
    .replace(/^```(?:\w+)?\n?/, "")
    .replace(/\n?```\s*$/, "")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "<$2|$1>")
    .trim();
}

export async function composeBriefing(data: BriefingData): Promise<string> {
  const prompt = `Today is ${data.weekday}.

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

export function briefingBlocks(text: string): Block[] {
  const out: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > SECTION_LIMIT) {
      if (current) out.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) out.push(current);
  return out.map((chunk) => sectionBlock(chunk));
}
