"use client";

import { useEffect, useState } from "react";

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
  { name: "universal", description: "General development and test runs", status: "Ready" },
  { name: "agent-browser", description: "Linux desktop and browser automation", status: "Ready" },
  { name: "herdr", description: "Lightweight agent workspace", status: "Available" },
  { name: "orca", description: "Specialized agent workspace", status: "Available" },
];

const setupSteps = [
  { label: "Protect the control-plane session", complete: false },
  { label: "Choose a repository", complete: false },
  { label: "Launch the first isolated run", complete: false },
];

export function NemoDashboard() {
  const [connection, setConnection] = useState<"checking" | "online" | "offline">("checking");
  let connectionLabel = "Unavailable";
  if (connection === "checking") connectionLabel = "Checking…";
  if (connection === "online") connectionLabel = "Read-only API online";

  useEffect(() => {
    const controller = new AbortController();
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
                  {step.complete ? <CheckCircle2 className="size-4 text-green-600" /> : index + 1}
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
              The read-only control plane is online; authenticated account data is the next gate.
            </span>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workbench summary">
        <SummaryCard
          icon={Server}
          label="Active machines"
          value="—"
          detail={connection === "online" ? "Session required to load live data" : "Control plane unavailable"}
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
            <EmptyState
              icon={Server}
              title="No machines connected"
              description="Once the control plane has an Instabox key, running machines and their status will show here."
            />
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
            <CardDescription>Available options from the connected Instabox account.</CardDescription>
            <CardAction>
              <Badge variant="outline">4 templates</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
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

      <Card id="settings">
        <CardHeader>
          <CardTitle>Control-plane status</CardTitle>
          <CardDescription>Credentials and dynamic provider calls stay server-side.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <StatusItem icon={ShieldCheck} label="Credential location" value="Protected server secret" />
          <StatusItem icon={Clock3} label="Execution boundary" value="Instabox only" />
          <StatusItem icon={Activity} label="Connection" value={connectionLabel} />
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
