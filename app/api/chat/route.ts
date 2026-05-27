import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createClient } from "@/lib/supabase/server";
import { buildGlowContext } from "@/lib/ai/context";
import { GLOW_MODEL } from "@/lib/ai/model";
import { GLOW_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import { makeGlowTools } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { messages }: { messages: UIMessage[] } = await request.json();
  const context = await buildGlowContext(supabase);
  const tools = makeGlowTools({
    supabase,
    actorUserId: null,
    source: "chat",
  });

  const result = streamText({
    model: GLOW_MODEL,
    system: `${GLOW_SYSTEM_PROMPT}\n\nDATA:\n${JSON.stringify(context)}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
