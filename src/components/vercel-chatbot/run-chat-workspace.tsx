"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { cn } from "cn";
import {
  ActivityIcon,
  ArrowLeftIcon,
  BotIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  ServerIcon,
  SquareTerminalIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CONTROL_PLANE_ORIGIN } from "@/config/control-plane";

import { type VercelChatMessage, VercelConversation } from "./vercel-conversation";
import { VercelPromptComposer } from "./vercel-prompt-composer";

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

type ChatDetail = { chat: ChatSummary; run: Run; messages: VercelChatMessage[] };
type RunLog = { id: number; stream: string; chunk: string; createdAt: string };

function sessionToken() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem("nemo-control-token") || "";
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function runIsOpen(run?: Run | null) {
  return Boolean(run?.machineId) && !["cancelled", "cleaned"].includes(run?.status ?? "");
}

export function RunChatWorkspace() {
  const params = useSearchParams();
  const requestedRunId = params.get("run");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const loadChats = useCallback(async () => {
    const token = sessionToken();
    if (!token) throw new Error("Connect Nemo before opening an agent chat.");
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Chats could not be loaded.");
    setChats(body.chats || []);
    return body.chats as ChatSummary[];
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats/${encodeURIComponent(chatId)}`, {
      headers: { Authorization: `Bearer ${sessionToken()}` },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "The chat could not be loaded.");
    setDetail(body);
    if (body.run?.id) {
      const logsResponse = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs/${encodeURIComponent(body.run.id)}/logs`, {
        headers: { Authorization: `Bearer ${sessionToken()}` },
      });
      const logsBody = await logsResponse.json();
      if (logsResponse.ok) setLogs(logsBody.logs || []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadChats()
      .then(async (available) => {
        if (cancelled) return;
        let selected = requestedRunId ? available.find((chat) => chat.runId === requestedRunId) : undefined;
        if (requestedRunId && !selected) {
          const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs/${encodeURIComponent(requestedRunId)}/chat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sessionToken()}` },
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || "A chat cannot be opened for this run.");
          selected = body.chat;
          setChats((current) => [body.chat, ...current.filter((chat) => chat.id !== body.chat.id)]);
        }
        setActiveChatId(selected?.id || available[0]?.id || null);
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeChatId || !draft.trim() || !runIsOpen(detail?.run) || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    setNotice("");
    try {
      const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/chats/${encodeURIComponent(activeChatId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The agent could not respond.");
      setDetail(body);
      setChats((current) => current.map((chat) => (chat.id === activeChatId ? body.chat : chat)));
    } catch (error) {
      setDraft(content);
      setNotice(error instanceof Error ? error.message : "The agent could not respond.");
    } finally {
      setSending(false);
    }
  }

  const recentLogs = useMemo(() => logs.slice(-8), [logs]);

  if (!sessionToken()) {
    return (
      <div className="flex min-h-[calc(100svh-10rem)] items-center justify-center">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <BotIcon className="mx-auto size-8 text-primary" />
          <h1 className="mt-4 font-semibold text-lg">Connect Nemo to open chats</h1>
          <p className="mt-2 text-muted-foreground text-sm">Chats use the same protected session as your runs.</p>
          <Button asChild className="mt-6">
            <Link href="/dashboard/default#settings">Connect Nemo</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100svh-10rem)] min-w-0 flex-col overflow-hidden rounded-xl border bg-sidebar shadow-sm">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3">
        <Button asChild aria-label="Back to runs" size="icon-sm" variant="ghost">
          <Link href="/dashboard/default">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4 text-primary" />
          <span className="font-medium text-sm">Nemo chats</span>
        </div>
        <span className="text-muted-foreground text-xs">One conversation per active run</span>
        <Button
          aria-label="Refresh chats"
          className="ml-auto"
          onClick={() => loadChats().catch((error) => setNotice(error.message))}
          size="icon-sm"
          variant="ghost"
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {notice ? (
        <div className="border-destructive/30 border-b bg-destructive/5 px-4 py-2 text-destructive text-xs">
          {notice}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <aside className="hidden min-h-0 flex-col border-r bg-sidebar md:flex">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="font-medium text-sm">History</div>
            <span className="text-muted-foreground text-xs">{chats.length}</span>
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? <p className="px-3 py-6 text-muted-foreground text-sm">Loading chats…</p> : null}
            {!loading && chats.length === 0 ? (
              <p className="px-3 py-8 text-center text-muted-foreground text-xs">
                Open Chat from a run card to start a conversation.
              </p>
            ) : null}
            <div className="space-y-1">
              {chats.map((chat) => (
                <button
                  className={cn(
                    "w-full rounded-lg px-3 py-3 text-left transition-colors hover:bg-sidebar-accent",
                    activeChatId === chat.id && "bg-sidebar-accent ring-1 ring-sidebar-border",
                  )}
                  key={chat.id}
                  onClick={() => setActiveChatId(chat.id)}
                  type="button"
                >
                  <div className="flex items-start gap-2">
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                        {(chat.repositoryName ?? "N").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-xs">{chat.repositoryName ?? "Repository"}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {relativeTime(chat.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{chat.task ?? chat.title}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t p-3">
            <Button asChild className="w-full" size="sm" variant="outline">
              <Link href="/dashboard/default">
                <ArrowLeftIcon /> Back to runs
              </Link>
            </Button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-background">
          {detail ? (
            <>
              <header className="flex min-h-14 items-center gap-3 border-b bg-sidebar/60 px-4 py-3">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <BotIcon className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">Nemo agent</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {detail.run.repositoryName} · {detail.run.ref ?? "main"}
                  </p>
                </div>
                <Badge className="ml-auto" variant={runIsOpen(detail.run) ? "secondary" : "outline"}>
                  {detail.run.status}
                </Badge>
              </header>
              <VercelConversation messages={detail.messages} sending={sending} />
              <div className="border-t bg-background px-3 py-3 md:px-4 md:py-4">
                <VercelPromptComposer
                  disabled={!runIsOpen(detail.run) || sending}
                  onChange={setDraft}
                  onSubmit={sendMessage}
                  placeholder={
                    runIsOpen(detail.run)
                      ? "Ask the agent to inspect, change, or test this repository…"
                      : "This run's machine is closed"
                  }
                  sending={sending}
                  value={draft}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <BotIcon className="size-8 text-muted-foreground" />
              <p className="mt-3 font-medium">Select an agent chat</p>
              <p className="mt-1 max-w-sm text-muted-foreground text-sm">
                Choose a run conversation from the history panel.
              </p>
            </div>
          )}
        </main>

        <aside className="hidden min-h-0 flex-col border-l bg-muted/10 xl:flex">
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
                <ContextRow icon={GitBranchIcon} label="Ref" value={detail.run.ref ?? "main"} />
                <ContextRow icon={ServerIcon} label="Node" value={detail.run.nodeName ?? "Preparing…"} />
                <ContextRow icon={ActivityIcon} label="Agent" value={detail.run.agentStatus} />
                <ContextRow icon={CheckCircle2Icon} label="Tests" value={detail.run.testStatus} />
                {detail.run.commitSha ? (
                  <ContextRow icon={GitBranchIcon} label="Commit" value={detail.run.commitSha.slice(0, 8)} />
                ) : null}
              </div>
              {detail.run.previewUrl ? (
                <div className="px-4 pb-4">
                  <Button asChild className="w-full" size="sm" variant="outline">
                    <a href={detail.run.previewUrl} rel="noreferrer" target="_blank">
                      <ExternalLinkIcon /> Open preview
                    </a>
                  </Button>
                </div>
              ) : null}
              <Separator />
              <div className="p-4">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <SquareTerminalIcon className="size-4" /> Activity
                </div>
                <div className="mt-3 space-y-2">
                  {recentLogs.length ? (
                    recentLogs.map((log) => (
                      <div className="rounded-md border bg-background p-2" key={log.id}>
                        <p className="font-medium text-[10px] uppercase tracking-wide">{log.stream}</p>
                        <p className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap text-[11px] text-muted-foreground">
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

function ContextRow({ icon: Icon, label, value }: { icon: typeof GitBranchIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="truncate font-medium text-xs">{value}</p>
      </div>
    </div>
  );
}

