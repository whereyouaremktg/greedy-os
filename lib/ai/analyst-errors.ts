export function analystErrorSlackText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("Free tier users") ||
    message.includes("RestrictedModels") ||
    message.includes("no_providers_available")
  ) {
    return (
      "Glow's AI model isn't available on your Vercel AI Gateway plan. " +
      "Use `anthropic/claude-sonnet-4.6` (default) or add paid credits for Opus."
    );
  }
  return "I hit an issue — Paul, check logs.";
}
