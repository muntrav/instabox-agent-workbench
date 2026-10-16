"use client";

import { type FormEvent, useEffect, useState } from "react";

import Link from "next/link";

import {
  Activity,
  ArrowUpRight,
  Box,
  CheckCircle2,
  CircleDashed,
  CirclePlay,
  Clock3,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  type LucideIcon,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  SquareTerminal,
  Trash2,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTROL_PLANE_ORIGIN } from "@/config/control-plane";

const templates = [
  { name: "universal", description: "General development and test runs", status: "Preview" },
  { name: "agent-browser", description: "Linux desktop and browser automation", status: "Preview" },
  { name: "herdr", description: "Lightweight agent workspace", status: "Preview" },
  { name: "orca", description: "Specialized agent workspace", status: "Preview" },
];

const setupSteps = [
  { label: "Protect the control-plane session", complete: false },
  { label: "Choose a repository", complete: false },
  { label: "Launch the first isolated run", complete: false },
];

type Overview = {
  account?: { name?: string; login?: string };
  machines?: Array<{ id: string; name: string; state: string }>;
  templates?: Array<{ id: string; version: string }>;
  usage?: { machines?: number; limits?: { maxMachines?: number } };
};

type Run = {
  id: string;
  repositoryName?: string;
  ref?: string;
  task: string;
  templateId: string;
  previewUrl?: string | null;
  machineId?: string | null;
  commitSha?: string | null;
  status: string;
  agentStatus: string;
  testStatus: string;
  errorMessage?: string | null;
  createdAt: string;
};

type RunLog = { id: number; stream: string; chunk: string; createdAt: string };

export function NemoDashboard() {
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [controlToken, setControlToken] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessionMessage, setSessionMessage] = useState("Account data requires a Nemo session token.");
  const [connecting, setConnecting] = useState(false);
  const [capabilities, setCapabilities] = useState({ agentRunner: false, persistence: false, mutations: false });
  const [runs, setRuns] = useState<Run[]>([]);
  const [runLogs, setRunLogs] = useState<Record<string, RunLog[]>>({});
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runMessage, setRunMessage] = useState("Connect Nemo to queue a run.");
  const [runForm, setRunForm] = useState({
    repositoryUrl: "",
    ref: "main",
    task: "",
    templateId: "universal",
    previewPort: "",
  });
  let connectionLabel = "Unavailable";
  if (connection === "checking") connectionLabel = "Checking…";
  if (connection === "online") connectionLabel = overview ? "Account data online" : "Read-only health online";

  const visibleTemplates = overview?.templates?.length
    ? overview.templates.map((template) => ({
        name: template.id,
        description: `Connected version ${template.version}`,
        status: "Live",
      }))
    : templates;

  async function connectSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!controlToken.trim()) {
      setSessionMessage("Enter the separate Nemo session token to connect.");
      return;
    }

    setConnecting(true);
    setSessionMessage("Checking the protected account session…");
    try {
      const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/overview`, {
        headers: { Authorization: `Bearer ${controlToken.trim()}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The session could not be verified.");
      sessionStorage.setItem("nemo-control-token", controlToken.trim());
      setOverview(body);
      setSessionMessage(`Connected to ${body.account?.name || "the Instabox account"}.`);
      await loadRuns(controlToken.trim());
    } catch (error) {
      setOverview(null);
      setSessionMessage(error instanceof Error ? error.message : "The session could not be verified.");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setControlToken(sessionStorage.getItem("nemo-control-token") || "");
    fetch(`${CONTROL_PLANE_ORIGIN}/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Control plane health check failed");
        return response.json();
      })
      .then(
        (body: {
          capabilities?: { instaboxRead?: boolean; agentRunner?: boolean; persistence?: boolean; mutations?: boolean };
        }) => {
          setConnection(body.capabilities?.instaboxRead ? "online" : "offline");
          setCapabilities({
            agentRunner: Boolean(body.capabilities?.agentRunner),
            persistence: Boolean(body.capabilities?.persistence),
            mutations: Boolean(body.capabilities?.mutations),
          });
        },
      )
      .catch(() => setConnection("offline"));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("nemo-control-token");
    if (!token) return;
    fetch(`${CONTROL_PLANE_ORIGIN}/api/overview`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "The session could not be verified.");
        setOverview(body);
        setSessionMessage(`Connected to ${body.account?.name || "the Instabox account"}.`);
        fetch(`${CONTROL_PLANE_ORIGIN}/api/runs`, { headers: { Authorization: `Bearer ${token}` } })
          .then((runsResponse) => runsResponse.json())
          .then((runsBody) => setRuns(runsBody.runs || []))
          .catch(() => setRunMessage("Runs could not be loaded."));
      })
      .catch(() => {
        sessionStorage.removeItem("nemo-control-token");
        setSessionMessage("Account data requires a Nemo session token.");
      });
  }, []);

  async function loadRuns(token: string) {
    try {
      const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Runs could not be loaded.");
      setRuns(body.runs || []);
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : "Runs could not be loaded.");
    }
  }

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem("nemo-control-token");
    if (!token) {
      setRunMessage("Connect Nemo before queueing a run.");
      return;
    }
    setRunSubmitting(true);
    setRunMessage("Validating the run and reserving an isolated machine…");
    try {
      const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          repositoryUrl: runForm.repositoryUrl,
          ref: runForm.ref,
          task: runForm.task,
          templateId: runForm.templateId,
          previewPort: runForm.previewPort ? Number(runForm.previewPort) : null,
          retainMachine: Boolean(runForm.previewPort),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "The run could not be queued.");
      setRuns((current) => [body.run, ...current.filter((run) => run.id !== body.run.id)]);
      setRunForm((current) => ({ ...current, task: "" }));
      setRunMessage(`Run ${body.run.id} queued. The dashboard will refresh its status.`);
    } catch (error) {
      setRunMessage(error instanceof Error ? error.message : "The run could not be queued.");
    } finally {
      setRunSubmitting(false);
    }
  }

  async function toggleRunLogs(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(runId);
    if (runLogs[runId]) return;
    const token = sessionStorage.getItem("nemo-control-token");
    if (!token) return;
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs/${runId}/logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();
    if (response.ok) setRunLogs((current) => ({ ...current, [runId]: body.logs || [] }));
  }

  async function refreshRuns() {
    const token = sessionStorage.getItem("nemo-control-token");
    if (token) await loadRuns(token);
  }

  async function deleteRun(runId: string) {
    if (!window.confirm("Delete the Instabox machine for this run? This cannot be undone.")) return;
    const token = sessionStorage.getItem("nemo-control-token");
    if (!token) return;
    const response = await fetch(`${CONTROL_PLANE_ORIGIN}/api/runs/${runId}/actions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Nemo-Confirm": "true",
      },
      body: JSON.stringify({ action: "delete" }),
    });
    if (response.ok) await loadRuns(token);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Agent workbench</p>
          <h1 className="text-3xl tracking-tight">Nemo</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Run coding tasks in isolated Instabox machines, review the result, and keep GitHub as the source of truth.
          </p>
        </div>
        <Button asChild>
          <Link href="#new-run">
            <Plus />
            New run
          </Link>
        </Button>
      </section>

      <Card className="border-primary/25 bg-primary/[0.04]" id="settings">
        <CardHeader>
          <CardTitle>Connect Nemo</CardTitle>
          <CardDescription>
            Enter the Nemo password you created for this dashboard. It is separate from your Cloudflare and Instabox
            credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={connectSession}>
            <label className="sr-only" htmlFor="nemo-session-password">
              Nemo password
            </label>
            <input
              aria-describedby="nemo-session-help"
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              id="nemo-session-password"
              onChange={(event) => setControlToken(event.target.value)}
              placeholder="Enter Nemo password"
              type="password"
              value={controlToken}
            />
            <Button disabled={connecting} type="submit">
              {connecting ? "Connecting…" : "Connect Nemo"}
            </Button>
          </form>
          <p className="text-muted-foreground text-xs" id="nemo-session-help">
            {sessionMessage} Stored only in this browser session.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/25 bg-primary/[0.04]" id="new-run">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Workflow className="size-4" />
            </div>
            <div>
              <CardTitle>Start your first run</CardTitle>
              <CardDescription>
                One isolated machine per task. No project workloads run on the control plane.
              </CardDescription>
            </div>
          </div>
          <CardAction>
            <Badge variant="outline">Preview</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {setupSteps.map((step, index) => (
              <div className="flex items-center gap-3 rounded-lg border bg-background/60 p-3" key={step.label}>
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs">
                  {(index === 0 && overview) || step.complete ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-sm">{step.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="https://instabox.sh/docs/start" target="_blank" rel="noreferrer">
                <Server />
                Read Instabox setup
                <ExternalLink />
              </Link>
            </Button>
            <span className="text-muted-foreground text-xs">
              {capabilities.agentRunner
                ? "Run orchestration is available; each task stays inside its Instabox machine."
                : "Run orchestration is waiting for the protected agent runtime command."}
            </span>
          </div>
          <form className="mt-6 grid gap-3 border-t pt-6" onSubmit={createRun}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="grid gap-1 text-sm">
                GitHub repository
                <input
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setRunForm((current) => ({ ...current, repositoryUrl: event.target.value }))}
                  placeholder="https://github.com/owner/repository"
                  required
                  type="url"
                  value={runForm.repositoryUrl}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Branch or ref
                <input
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setRunForm((current) => ({ ...current, ref: event.target.value }))}
                  required
                  value={runForm.ref}
                />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
              <label className="grid gap-1 text-sm">
                Task
                <textarea
                  className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setRunForm((current) => ({ ...current, task: event.target.value }))}
                  placeholder="Describe the coding task for the configured agent"
                  required
                  value={runForm.task}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Machine template
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => setRunForm((current) => ({ ...current, templateId: event.target.value }))}
                  value={runForm.templateId}
                >
                  {visibleTemplates.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Preview port <span className="text-muted-foreground text-xs">optional</span>
                <input
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  max="65535"
                  min="1024"
                  onChange={(event) => setRunForm((current) => ({ ...current, previewPort: event.target.value }))}
                  placeholder="3000"
                  type="number"
                  value={runForm.previewPort}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!overview || !capabilities.agentRunner || runSubmitting} type="submit">
                {runSubmitting ? <LoaderCircle className="animate-spin" /> : <CirclePlay />}
                Queue isolated run
              </Button>
              <p className="text-muted-foreground text-xs">{runMessage}</p>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workbench summary">
        <SummaryCard
          icon={Server}
          label="Active machines"
          value={overview?.machines?.length?.toString() || "—"}
          detail={
            overview
              ? `${overview.usage?.limits?.maxMachines ?? ""} machine limit`
              : "Session required to load live data"
          }
        />
        <SummaryCard
          icon={CirclePlay}
          label="Running tasks"
          value={runs
            .filter((run) => !["completed", "failed", "cancelled", "cleaned"].includes(run.status))
            .length.toString()}
          detail={capabilities.persistence ? "Persisted in Nemo" : "Persistence unavailable"}
        />
        <SummaryCard icon={GitBranch} label="Repositories" value="—" detail="GitHub integration pending" />
        <SummaryCard icon={Activity} label="Latest result" value="—" detail="No runs yet" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card id="machines">
          <CardHeader>
            <CardTitle>Active machines</CardTitle>
            <CardDescription>Ephemeral workspaces currently available to Nemo.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="#templates">
                  Templates
                  <ArrowUpRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {overview?.machines?.length ? (
              <div className="space-y-3">
                {overview.machines.map((machine) => (
                  <div className="flex items-center gap-3 rounded-lg border p-3" key={machine.id}>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Server className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-sm">{machine.name || machine.id}</p>
                      <p className="truncate text-muted-foreground text-xs">{machine.id}</p>
                    </div>
                    <Badge variant="outline">{machine.state}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Server}
                title={overview ? "No machines connected" : "Machine status unavailable"}
                description={
                  overview ? "No Instabox machines exist yet." : "Connect a Nemo session to load live machine status."
                }
              />
            )}
          </CardContent>
        </Card>

        <Card id="runs">
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Task history stays tied to its GitHub repository and commit.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button onClick={refreshRuns} size="sm" variant="ghost">
                    <RefreshCw />
                    Refresh
                  </Button>
                </div>
                {runs.slice(0, 8).map((run) => (
                  <div className="rounded-lg border p-3" key={run.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{run.repositoryName || "GitHub repository"}</p>
                        <p className="mt-1 text-muted-foreground text-xs">{run.task}</p>
                      </div>
                      <Badge variant={run.status === "completed" ? "secondary" : "outline"}>{run.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span>{run.id}</span>
                      <span>·</span>
                      <span>{run.ref}</span>
                      {run.commitSha ? (
                        <>
                          <span>·</span>
                          <span>{run.commitSha.slice(0, 7)}</span>
                        </>
                      ) : null}
                      {run.previewUrl ? (
                        <a
                          className="font-medium text-primary underline-offset-4 hover:underline"
                          href={run.previewUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Preview
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => toggleRunLogs(run.id)} size="sm" variant="outline">
                        <SquareTerminal />
                        {expandedRun === run.id ? "Hide logs" : "Logs"}
                      </Button>
                      {run.machineId ? (
                        <Button onClick={() => deleteRun(run.id)} size="sm" variant="ghost">
                          <Trash2 />
                          Delete machine
                        </Button>
                      ) : null}
                    </div>
                    {run.errorMessage ? <p className="mt-2 text-destructive text-xs">{run.errorMessage}</p> : null}
                    {expandedRun === run.id ? (
                      <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                        {(runLogs[run.id] || []).map((log) => `[${log.stream}] ${log.chunk}`).join("\n") ||
                          "Loading logs…"}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CircleDashed}
                title="No runs yet"
                description="Queue a task to see its status, logs, tests, commit, and preview URL."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card id="repositories">
          <CardHeader>
            <CardTitle>Repository boundary</CardTitle>
            <CardDescription>Nemo coordinates work; GitHub remains authoritative.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BoundaryRow
              icon={GitBranch}
              title="GitHub"
              description="Source, branches, reviews, and CI"
              state="Source of truth"
            />
            <BoundaryRow
              icon={SquareTerminal}
              title="Instabox"
              description="Isolated agents, tests, and temporary previews"
              state="Worker"
            />
            <BoundaryRow
              icon={ShieldCheck}
              title="Cloudflare"
              description="Approved frontend preview and production deployment"
              state="Release"
            />
          </CardContent>
        </Card>

        <Card id="templates">
          <CardHeader>
            <CardTitle>Machine templates</CardTitle>
            <CardDescription>
              {overview
                ? "Live options from the connected Instabox account."
                : "Preview catalog until a session is connected."}
            </CardDescription>
            <CardAction>
              <Badge variant="outline">{visibleTemplates.length} templates</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {visibleTemplates.map((template) => (
              <div className="rounded-lg border p-3" key={template.name}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Box className="size-4 text-muted-foreground" />
                    <span className="font-medium">{template.name}</span>
                  </div>
                  <Badge variant="secondary">{template.status}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground text-xs">{template.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control-plane status</CardTitle>
          <CardDescription>Credentials and dynamic provider calls stay server-side.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatusItem icon={ShieldCheck} label="Credential location" value="Protected server secret" />
            <StatusItem icon={Clock3} label="Execution boundary" value="Instabox only" />
            <StatusItem icon={Activity} label="Connection" value={connectionLabel} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="text-3xl tracking-tight">{value}</div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center">
      <Icon className="size-6 text-muted-foreground" />
      <p className="mt-3 font-medium text-sm">{title}</p>
      <p className="mt-1 max-w-md text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function BoundaryRow({
  icon: Icon,
  title,
  description,
  state,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  state: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="truncate text-muted-foreground text-xs">{description}</p>
      </div>
      <Badge variant="outline">{state}</Badge>
    </div>
  );
}

function StatusItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}
