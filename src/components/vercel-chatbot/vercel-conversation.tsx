"use client";

import { useEffect, useRef } from "react";

import { cn } from "cn";
import { ArrowDownIcon, BotIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

export type VercelChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  kind: "message" | "error" | "tool";
  createdAt: string;
};

type VercelConversationProps = {
  messages: VercelChatMessage[];
  sending: boolean;
};

// Adapted directly from Vercel Chatbot's components/chat/messages.tsx and
// components/ai-elements/conversation.tsx at c2f8235e1f3ea903ad8b7f61447c4f74164b5c58.
// The template's message model is mapped to Nemo's persisted run-chat model.
export function VercelConversation({ messages, sending }: VercelConversationProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const _messageCount = messages.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  return (
    <div className="relative min-h-0 flex-1 bg-background">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1" role="log">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto min-h-full w-full max-w-4xl gap-8 px-4 py-6 md:px-8">
              {messages.length === 0 ? (
                <div className="flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm">
                    <BotIcon className="size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-medium text-sm">Ask the Nemo agent</h2>
                    <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                      The agent has the repository, branch, task, and isolated machine context for this run.
                    </p>
                  </div>
                </div>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === "user";
                const isError = message.kind === "error";

                return (
                  <MessageScrollerItem key={message.id} messageId={String(message.id)} scrollAnchor={isUser}>
                    <div
                      className={cn(
                        "group flex w-full max-w-[95%] flex-col gap-2",
                        isUser ? "ml-auto items-end" : "items-start",
                      )}
                    >
                      <div className="flex items-end gap-2">
                        {!isUser ? (
                          <Avatar className="size-7 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">N</AvatarFallback>
                          </Avatar>
                        ) : null}
                        <div
                          className={cn(
                            "max-w-[min(76ch,calc(100vw-5rem))] whitespace-pre-wrap break-words text-[13px] leading-relaxed",
                            isUser
                              ? "rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground"
                              : "rounded-2xl rounded-bl-md border bg-card px-4 py-3 shadow-sm",
                            isError && "border-destructive/40 bg-destructive/5 text-destructive",
                          )}
                        >
                          {message.content}
                        </div>
                      </div>
                      <time className="px-1 text-[11px] text-muted-foreground">
                        {new Date(message.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </MessageScrollerItem>
                );
              })}

              {sending ? (
                <div className="flex items-center gap-2 px-10 text-muted-foreground text-sm">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
                  Nemo is working in Instabox…
                </div>
              ) : null}
              <div className="min-h-6" ref={endRef} />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <button
        aria-label="Scroll to latest message"
        className="sr-only"
        onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}
        type="button"
      >
        <ArrowDownIcon />
      </button>
    </div>
  );
}

