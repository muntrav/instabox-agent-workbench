import Link from "next/link";

import { ArrowUpRight, GitBranch, Server, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { LandingThemeSwitcher } from "./_components/landing-theme-switcher";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Nemo: Instabox Agent Workbench",
  description: "Run isolated Instabox coding agents and review their results from one focused workbench.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  // Keeps landing-page colors independent from saved dashboard theme presets.
  return (
    <main className={`${styles.landing} min-h-screen bg-background text-foreground`} data-landing-page>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:gap-8 sm:p-6 md:p-8">
        <header className="flex items-start justify-between gap-4 sm:items-center sm:gap-6">
          <Link className="font-medium text-base tracking-tight" href="/" aria-label="Nemo home" prefetch={false}>
            Nemo
          </Link>
          <LandingThemeSwitcher />
        </header>
        <section className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-widest">Agent workbench</p>
            <h1 className="text-balance font-medium text-3xl leading-tight tracking-tight sm:text-5xl">
              A clear control surface for isolated coding work.
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-6 sm:text-base">
              Nemo coordinates GitHub tasks, Instabox machines, test runs, and temporary previews while keeping the
              control plane separate from project execution.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button asChild>
              <Link href="/dashboard/default" prefetch={false}>
                Open workbench
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="https://instabox.sh/docs/start" target="_blank" rel="noreferrer">
                Instabox setup
                <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
          </div>
        </section>
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Nemo boundaries">
          <BoundaryCard icon={GitBranch} title="GitHub" description="Source of truth for repositories and changes." />
          <BoundaryCard icon={Server} title="Instabox" description="Isolated machines run agents and tests." />
          <BoundaryCard
            icon={ShieldCheck}
            title="Cloudflare"
            description="Approved previews and production releases."
          />
        </section>
      </div>
    </main>
  );
}

function BoundaryCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof GitBranch;
  title: string;
  description: string;
}) {
  return (
    <Card className="bg-background/70 shadow-none">
      <CardHeader>
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs leading-5">{description}</CardContent>
    </Card>
  );
}
