// The Glow OS analyst model.
//
// Routed through the Vercel AI Gateway by passing a `"provider/model"` string
// to the AI SDK. On Vercel, OIDC handles credentials in production. For local
// dev, set AI_GATEWAY_API_KEY from the Vercel team's gateway page.
//
// Default is Sonnet (available on AI Gateway free tier). Opus is restricted
// until the team has paid credits — override with GLOW_AI_MODEL when ready.
//
// Confirm slugs at https://vercel.com/<team>/~/ai/gateway/models
const DEFAULT_GLOW_MODEL = "anthropic/claude-sonnet-4.6";

export const GLOW_MODEL =
  process.env.GLOW_AI_MODEL?.trim() || DEFAULT_GLOW_MODEL;
