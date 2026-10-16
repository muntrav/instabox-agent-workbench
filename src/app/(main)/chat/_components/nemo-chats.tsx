"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "cn";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
  Server,
  SquareTerminal,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageAvatar, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Separator } from "@/components/ui/separator";
import { CONTROL_PLANE_ORIGIN } from "@/config/control-plane";

type ChatSummary = {
  id: string;
  runId: string;
  title: string;
  status: string;
  runStatus?: string | null;
  machineId?: string | null;
  nodeName?: string | null;
  repositoryName?: string | null;
  ref?: string | null;
  task?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  kind: "message" | "error" | "tool";
  metadata?: { model?: string | null } | null;
  createdAt: string;
};

type Run = {
  id: string;
  repositoryName?: string;
  repositoryUrl?: string;
  ref?: string;
  task: string;
  status: string;
  agentStatus: string;
  testStatus: string;
  commitSha?: string | null;
  previewUrl?: string | null;
  machineId?: string | null;
  nodeName?: string | null;
  errorMessage?: string | null;
};

type ChatDetail = {
  chat: ChatSummary;
  run: Run;
  messages: ChatMessage[];
};

type RunLog = { id: number; stream: string; chunk: string; createdAt: string };

function token() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem("nemo-control-token") || "";
}

function relativeTime(value: string) {
  const date = new Date(value).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - date) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function activeRun(run?: Run | null) {
  return Boolean(run?.machineId) && !["cancelled", "cleaned"].includes(run?.status ?? "");
}

export function NemoChats() {
  const searchParams = useSearchParams();
  const requestedRunId = searchParams.get("run");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const loadChats = useCallback(async () => {
    const sessionToken = token();
    if (!sessionToken) {
      setLoading(false);
      setNotice("Connect Nemo before opening an agent chat.");
      return [] as ChatSummary[];
    }
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Chats could not be loaded.");
    setChats(body.chats || []);
    return body.chats || [];
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats/${encodeURIComponent(chatId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "The chat could not be loaded.");
    setDetail(body);
    if (body.run?.id) {
      const logsResponse = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs/${encodeURIComponent(body.run.id)}/logs`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const logsBody = await logsResponse.json();
      if (logsResponse.ok) setLogs(logsBody.logs || []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadChats()
      .then(async (loaded) => {
        if (cancelled) return;
        let selected: ChatSummary | undefined;
        if (requestedRunId) {
          const existing = loaded.find((chat: ChatSummary) => chat.runId === requestedRunId);
          if (existing) {
            selected = existing;
          } else {
            const response = await fetch(
              `${CONTROL_PLANE_ORIGIN}/api/runs/${encodeURIComponent(requestedRunId)}/chat`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${token()}` },
              },
            );
            const body = await response.json();
            if (!response.ok) throw new Error(body.message || "A chat cannot be opened for this run.");
            selected = body.chat;
            setChats((current) => [body.chat, ...current.filter((chat) => chat.id !== body.chat.id)]);
          }
        }
        selected ||= loaded[0];
        if (selected) setActiveChatId(selected.id);
      })
      .catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Chats could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadChats, requestedRunId]);

  useEffect(() => {
    if (!activeChatId) {
      setDetail(null);
      return;
    }
    loadChat(activeChatId).catch((error) => setNotice(error instanceof Error ? error.message : "Chat unavailable."));
  }, [activeChatId, loadChat]);

  const selectChat = (chatId: string) => {
    setNotice("");
    setActiveChatId(chatId);
  };

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeChatId || !draft.trim() || !activeRun(detail?.run) || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    setNotice("");
    try {
      const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats/${encodeURIComponent(activeChatId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The agent could not respond.");
      setDetail(body);
      setChats((current) => current.map((chat) => (chat.id === activeChatId ? body.chat : chat)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The agent could not respond.");
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  const sortedLogs = useMemo(() => logs.slice(-8), [logs]);
  if (!token()) {
    return (
      <Card className="mx-auto mt-12 max-w-lg">
        <CardHeader>
          <CardTitle>Connect Nemo to view chats</CardTitle>
          <CardDescription>Chats are protected with the same session used for runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/dashboard/default#settings">Connect Nemo</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex min-h-[calc(100svh-10rem)] min-w-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Agent workbench</p>
          <h1 className="text-3xl tracking-tight">Chats</h1>
          <p className="text-muted-foreground text-sm">Talk to an agent inside the context of its active run.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/default">
            <ArrowLeft />
            Runs
          </Link>
        </Button>
      </div>

      {notice ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          {notice}
        </div>
      ) : null}

      <div className="grid min-h-[calc(100svh-15rem)] min-w-0 flex-1 gap-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <aside className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2 font-medium">
              <MessageCircle className="size-4" />
              Conversations
            </div>
            <Button
              aria-label="Refresh chats"
              onClick={() => loadChats().catch((error) => setNotice(error.message))}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? <p className="px-3 py-6 text-muted-foreground text-sm">Loading chats…</p> : null}
            {!loading && chats.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <CircleDashed className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 font-medium text-sm">No active chats</p>
                <p className="mt-1 text-muted-foreground text-xs">Open Chat on a run card to start one.</p>
              </div>
            ) : null}
            <div className="space-y-1">
              {chats.map((chat) => (
                <button
                  className={cn(
                    "w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/70",
                    activeChatId === chat.id && "bg-muted ring-1 ring-border",
                  )}
                  key={chat.id}
                  onClick={() => selectChat(chat.id)}
                  type="button"
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {(chat.repositoryName || "N").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-sm">{chat.repositoryName || "Repository"}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeTime(chat.updatedAt)}
                        </span>
                      </div>
                      <p className="truncate text-muted-foreground text-xs">{chat.task || chat.title}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col">
          {detail ? (
            <>
              <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">Nemo agent</p>
                    <p className="truncate text-muted-foreground text-xs">
                      {detail.run.repositoryName} · {detail.run.ref}
                    </p>
                  </div>
                </div>
                <Badge variant={activeRun(detail.run) ? "secondary" : "outline"}>{detail.run.status}</Badge>
              </header>
              <MessageScrollerProvider autoScroll>
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="gap-5 px-4 py-6 md:px-8">
                      {detail.messages.map((message) => {
                        const outbound = message.role === "user";
                        let bubbleVariant: "default" | "destructive" | "muted" = "muted";
                        if (outbound) bubbleVariant = "default";
                        if (message.kind === "error") bubbleVariant = "destructive";
                        return (
                          <Message align={outbound ? "end" : "start"} key={message.id}>
                            <MessageAvatar>
                              <Avatar className="size-8">
                                <AvatarFallback
                                  className={cn("text-xs", outbound && "bg-primary text-primary-foreground")}
                                >
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
                          <LoaderCircle className="size-4 animate-spin" /> Nemo is working in Instabox…
                        </div>
                      ) : null}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                </MessageScroller>
              </MessageScrollerProvider>
              <div className="border-t p-3 md:p-4">
                <form onSubmit={sendMessage}>
                  <InputGroup className="bg-background">
                    <InputGroupTextarea
                      disabled={!activeRun(detail.run) || sending}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder={
                        activeRun(detail.run)
                          ? "Ask the agent to inspect, change, or test the repository…"
                          : "This run's machine is closed"
                      }
                      value={draft}
                    />
                    <InputGroupAddon align="block-end">
                      <span className="px-2 text-muted-foreground text-xs">
                        Enter to send · Shift+Enter for a new line
                      </span>
                      <InputGroupButton
                        className="ml-auto"
                        disabled={!draft.trim() || !activeRun(detail.run) || sending}
                        size="icon-sm"
                        type="submit"
                      >
                        {sending ? <LoaderCircle className="animate-spin" /> : <Send />}
                        <span className="sr-only">Send message</span>
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <Bot className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Select an agent chat</p>
              <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                Choose a conversation on the left, or open Chat from a run card.
              </p>
            </div>
          )}
        </main>

        <aside className="hidden min-h-0 flex-col border-l bg-muted/10 lg:flex">
          {detail ? (
            <div className="min-h-0 overflow-y-auto">
              <div className="p-4">
                <p className="font-medium text-sm">Run context</p>
                <p className="mt-1 break-all text-muted-foreground text-xs">
                  {detail.run.repositoryUrl ?? detail.run.repositoryName}
                </p>
              </div>
              <Separator />
              <div className="space-y-3 p-4">
                <ContextRow icon={GitBranch} label="Ref" value={detail.run.ref ?? "main"} />
                <ContextRow icon={Server} label="Node" value={detail.run.nodeName ?? "Preparing…"} />
                <ContextRow icon={CheckCircle2} label="Tests" value={detail.run.testStatus} />
                {detail.run.commitSha ? (
                  <ContextRow icon={GitBranch} label="Commit" value={detail.run.commitSha.slice(0, 8)} />
                ) : null}
              </div>
              {detail.run.previewUrl ? (
                <div className="px-4 pb-4">
                  <Button asChild className="w-full" size="sm" variant="outline">
                    <a href={detail.run.previewUrl} rel="noreferrer" target="_blank">
                      <ExternalLink /> Open preview
                    </a>
                  </Button>
                </div>
              ) : null}
              <Separator />
              <div className="p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <SquareTerminal className="size-4" /> Recent activity
                </div>
                <div className="mt-3 space-y-2">
                  {sortedLogs.length ? (
                    sortedLogs.map((log) => (
                      <div className="rounded-md border bg-background p-2" key={log.id}>
                        <p className="font-medium text-[11px] uppercase tracking-wide">{log.stream}</p>
                        <p className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap text-muted-foreground text-xs">
                          {log.chunk}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-xs">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ContextRow({ icon: Icon, label, value }: { icon: typeof GitBranch; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate font-medium text-xs">{value}</p>
      </div>
    </div>
  );
}
