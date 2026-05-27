import type { GenerateTextResult } from "ai";

import {
  formatToolSuccessLabel,
  isWriteTool,
} from "@/lib/ai/tool-labels";
import { isGlowToolResult } from "@/lib/ai/tool-results";
import type { GlowTools } from "@/lib/ai/tools";

export type SlackToolAction = {
  toolName: string;
  id: string;
  label: string;
};

export function extractWriteActions(
  result: GenerateTextResult<GlowTools, never>,
): SlackToolAction[] {
  const actions: SlackToolAction[] = [];

  for (const step of result.steps) {
    for (const tr of step.staticToolResults) {
      if (!isWriteTool(tr.toolName)) continue;
      if (!isGlowToolResult(tr.output) || !tr.output.ok) continue;
      const id = (tr.output.data as { id?: string }).id;
      if (!id) continue;
      actions.push({
        toolName: tr.toolName,
        id,
        label: formatToolSuccessLabel(tr.toolName, tr.output),
      });
    }
  }

  return actions;
}
