"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { enrichNumbers } from "@/components/chat/number-inline";
import { StreamingDots } from "@/components/chat/streaming-dots";

const SUGGESTED_PROMPTS = [
  "How is our cash?",
  "Overdue POs?",
  "Top wholesale state?",
  "DTC revenue MoM",
] as const;

export function ChatPanel() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();
  const isStreaming = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      sendMessage({ text: trimmed });
      setInput("");
      stickToBottom.current = true;
    },
    [isStreaming, sendMessage],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 48;
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  return (
    <div className="flex h-full min-h-[480px] flex-col rounded-lg border bg-card lg:sticky lg:top-[calc(3rem+1.5rem)] lg:h-[calc(100vh-3rem-3rem)]">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="size-1.5 rounded-full bg-success animate-pulse" />
        <h2 className="text-sm font-medium">Analyst</h2>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="space-y-2 p-3">
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask about cash, AR, revenue, pipeline, or ops data pulled from
                the cache.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    disabled={isStreaming}
                    className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
                    suppressHydrationWarning
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-md px-3 py-2 text-[13px] leading-relaxed",
                m.role === "user"
                  ? "bg-muted/80 text-foreground"
                  : "bg-transparent",
              )}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {m.role === "user" ? "You" : "Analyst"}
              </div>
              {m.parts.map((part, i) =>
                part.type === "text" ? (
                  <p key={i} className="whitespace-pre-wrap">
                    {m.role === "assistant"
                      ? enrichNumbers(part.text)
                      : part.text}
                  </p>
                ) : null,
              )}
            </div>
          ))}

          {isStreaming &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") ? (
            <StreamingDots />
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the analyst…"
          disabled={isStreaming}
          className="h-8 text-sm"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={isStreaming || !input.trim()}
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
