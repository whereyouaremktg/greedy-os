// The Glow OS analyst model.
//
// Routed through the Vercel AI Gateway by passing a `"provider/model"` string
// to the AI SDK. On Vercel, OIDC handles credentials in production. For local
// dev, set AI_GATEWAY_API_KEY from the Vercel team's gateway page.
//
// Confirm the exact slug at https://vercel.com/<team>/~/ai/gateway/models
// before shipping — provider model aliases sometimes change.
export const GLOW_MODEL = "anthropic/claude-opus-4-7" as const;
