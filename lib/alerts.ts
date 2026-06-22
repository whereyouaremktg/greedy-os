import "server-only";
import { sendSlack } from "@/lib/slack/dispatch";
import { getSlackDefaultChannel } from "@/lib/slack/client";

// Operational alerting to Slack. Every function here is best-effort: it
// swallows its own errors so an alerting failure never masks (or replaces)
// the underlying problem it was trying to report.
//
// Dedupe is per-day (slack_notifications.dedupe_key) so a connector that
// fails or stays stale all day nags once, not every cron tick.

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Fired by runCronJob() when a cron job throws. Names the connector + the
// error so a silent pipeline death (e.g. QuickBooks losing its refresh token)
// shows up in #greedy-os the same day instead of a month later.
export async function alertCronFailure(
  name: string,
  message: string,
): Promise<void> {
  try {
    const channel = getSlackDefaultChannel();
    await sendSlack({
      channel,
      dedupeKey: `cron-fail:${name}:${todayUtc()}`,
      text: `Glow OS: ${name} cron failed`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:rotating_light: *${name}* cron failed\n\`\`\`${message.slice(0, 2500)}\`\`\``,
          },
        },
      ],
    });
  } catch {
    // best-effort
  }
}

export type ConnectorIssueKind = "stale" | "disconnected" | "token_expiring";

// Fired by the health cron when a connector's cached data is older than its
// threshold, or its credentials are missing / about to expire.
export async function alertConnectorIssue(opts: {
  connector: string;
  kind: ConnectorIssueKind;
  detail: string;
}): Promise<void> {
  try {
    const channel = getSlackDefaultChannel();
    const emoji =
      opts.kind === "disconnected"
        ? ":electric_plug:"
        : opts.kind === "token_expiring"
          ? ":hourglass_flowing_sand:"
          : ":warning:";
    await sendSlack({
      channel,
      dedupeKey: `health:${opts.connector}:${opts.kind}:${todayUtc()}`,
      text: `Glow OS health: ${opts.connector} ${opts.kind}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *${opts.connector}* — ${opts.detail}`,
          },
        },
      ],
    });
  } catch {
    // best-effort
  }
}
