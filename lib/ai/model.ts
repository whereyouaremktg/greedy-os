// Glow OS model routing — pick the model that fits each job.
//
// Models are routed through the Vercel AI Gateway by passing a `"provider/model"`
// string to the AI SDK. Provider credentials are BYOK keys configured in the
// Gateway (Anthropic + Google). On Vercel, OIDC handles Gateway auth in
// production; for local dev set AI_GATEWAY_API_KEY from the team's gateway page.
//
// Routing philosophy:
// - Claude  → reasoning, conversation, writing (interactive analyst, digest):
//             best at multi-step tool use and following the analyst write-rules.
// - Gemini  → bulk, vision, long-context (document parsing, email scanning):
//             cheap, fast, strong on images/PDFs and large inputs.
//
// Each is env-overridable so we can retune (e.g. bump the analyst to Opus, or
// drop the digest to Gemini to save cost) without a code change.
//
// Confirm slugs at https://vercel.com/<team>/~/ai/gateway/models

// Interactive analyst — in-app chat + Slack bot.
const DEFAULT_GLOW_MODEL = "anthropic/claude-sonnet-4.6";

// Daily morning digest — synthesis/writing, low volume.
const DEFAULT_DIGEST_MODEL = "anthropic/claude-sonnet-4.6";

// Document parsing (PO/proforma vision + PDF text). Flash, not Pro: Pro is
// quota-limited (429s) on the current Google key, and reliability on the upload
// path matters more than marginal accuracy. The improved parse prompt does the
// heavy lifting. Override with GLOW_PARSE_MODEL if Pro quota is raised.
const DEFAULT_PARSE_MODEL = "google/gemini-2.5-flash";

// Fallback chain when the primary model is rate-limited or unavailable
// (e.g. Gateway free-tier 429s on Claude, including via BYOK). Gemini Flash is
// the default fallback because it's proven on this Gateway (it runs the parse
// path). Comma-separated env override, tried in order after the primary.
const DEFAULT_FALLBACK_MODELS = "google/gemini-2.5-flash";

export const GLOW_FALLBACK_MODELS = (
  process.env.GLOW_FALLBACK_MODELS?.trim() || DEFAULT_FALLBACK_MODELS
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const GLOW_MODEL =
  process.env.GLOW_AI_MODEL?.trim() || DEFAULT_GLOW_MODEL;

export const GLOW_DIGEST_MODEL =
  process.env.GLOW_DIGEST_MODEL?.trim() || DEFAULT_DIGEST_MODEL;

export const GLOW_PARSE_MODEL =
  process.env.GLOW_PARSE_MODEL?.trim() || DEFAULT_PARSE_MODEL;
