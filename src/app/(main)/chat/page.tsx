import { Suspense } from "react";

import type { Metadata } from "next";

import { RunChatWorkspace } from "@/components/vercel-chatbot/run-chat-workspace";

export const metadata: Metadata = {
  title: "Chats · Nemo",
  description: "Talk to agents working in Nemo runs.",
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100svh-10rem)] items-center justify-center text-muted-foreground text-sm">
          Loading chats…
        </div>
      }
    >
      <RunChatWorkspace />
    </Suspense>
  );
}

