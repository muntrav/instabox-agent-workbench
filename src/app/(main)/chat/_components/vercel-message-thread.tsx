"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { cn } from "cn";
import { ArrowDownIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

type ThreadMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  kind: "message" | "error" | "tool";
  createdAt: string;
};

type VercelMessageThreadProps = {
  messages: ThreadMessage[];
  sending: boolean;
};

// Adapted directly from Vercel ai-chatbot's components/chat/messages.tsx
// at c2f8235e1f3ea903ad8b7f61447c4f74164b5c58. Nemo keeps its own data
// contract and design primitives while retaining the source's scroll behavior.
export function VercelMessageThread({ messages, sending }: VercelMessageThreadProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const isAtBottom = useStateAtBottom(viewportRef);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport ref={viewportRef}>
          <MessageScrollerContent className="mx-auto w-full max-w-4xl gap-5 px-4 py-6 md:gap-7 md:px-8">
            {messages.map((message) => {
              const outbound = message.role === "user";
              let bubbleVariant: "default" | "destructive" | "muted" = "muted";
              if (message.kind === "error") bubbleVariant = "destructive";
              else if (outbound) bubbleVariant = "default";

              return (
                <Message align={outbound ? "end" : "start"} key={message.id}>
                  <MessageAvatar>
                    <Avatar className="size-8">
                      <AvatarFallback className={cn("text-xs", outbound && "bg-primary text-primary-foreground")}>
                        {outbound ? "You" : "N"}
                      </AvatarFallback>
                    </Avatar>
                  </MessageAvatar>
                  <MessageContent>
                    <BubbleGroup>
                      <Bubble align={outbound ? "end" : "start"} variant={bubbleVariant}>
                        <BubbleContent className="whitespace-pre-wrap">{message.content}</BubbleContent>
                      </Bubble>
                    </BubbleGroup>
                    <MessageFooter>{new Date(message.createdAt).toLocaleString()}</MessageFooter>
                  </MessageContent>
                </Message>
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
      </MessageScroller>

      <button
        aria-label="Scroll to bottom"
        className={cn(
          "absolute bottom-4 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center rounded-full border border-border/50 bg-card/90 px-3.5 shadow-[var(--shadow-float)] backdrop-blur-lg transition-all duration-200",
          isAtBottom ? "pointer-events-none scale-90 opacity-0" : "scale-100 opacity-100",
        )}
        onClick={() => scrollToBottom()}
        type="button"
      >
        <ArrowDownIcon className="size-3 text-muted-foreground" />
      </button>
    </MessageScrollerProvider>
  );
}

function useStateAtBottom(viewportRef: RefObject<HTMLDivElement | null>) {
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      setIsAtBottom(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [viewportRef]);

  return isAtBottom;
}
