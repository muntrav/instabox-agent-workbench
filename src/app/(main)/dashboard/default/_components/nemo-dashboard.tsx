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
  type LucideIcon,
  Plus,
  Server,
  ShieldCheck,
  SquareTerminal,
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

export function NemoDashboard() {
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  const [controlToken, setControlToken] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessionMessage, setSessionMessage] = useState("Account data requires a Nemo session token.");
  const [connecting, setConnecting] = useState(false);
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
      .then((body: { capabilities?: { instaboxRead?: boolean } }) => {
        setConnection(body.capabilities?.instaboxRead ? "online" : "offline");
      })
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
      })
      .catch(() => {
        sessionStorage.removeItem("nemo-control-token");
        setSessionMessage("Account data requires a Nemo session token.");
      });
  }, []);

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
              {overview
                ? "Live account data is connected; machine mutations remain disabled."
                : "The read-only control plane is online; authenticated account data is the next gate."}
            </span>
          </div>
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
        <SummaryCard icon={CirclePlay} label="Running tasks" value="—" detail="Runs will appear here" />
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
            <EmptyState
              icon={CircleDashed}
              title="No runs yet"
              description="Launch a task to see its status, logs, tests, and preview URL."
            />
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
