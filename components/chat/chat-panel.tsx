"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="size-4" />
          Glow analyst
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 min-h-0">
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask things like &ldquo;how is our cash?&rdquo;, &ldquo;which POs
                are overdue?&rdquo;, or &ldquo;which state has the most
                wholesale pipeline?&rdquo;.
              </p>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "text-sm rounded-md px-3 py-2",
                  m.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-foreground/5",
                )}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  {m.role === "user" ? "You" : "Analyst"}
                </div>
                {m.parts.map((part, i) =>
                  part.type === "text" ? (
                    <p key={i} className="whitespace-pre-wrap leading-relaxed">
                      {part.text}
                    </p>
                  ) : null,
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text || isStreaming) return;
            sendMessage({ text });
            setInput("");
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the analyst…"
            disabled={isStreaming}
          />
          <Button type="submit" size="icon" disabled={isStreaming || !input.trim()}>
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
