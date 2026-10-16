"use client";

import Link from "next/link";

import { siGithub } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const repositories = [
  {
    label: "Nemo on GitHub",
    href: "https://github.com/muntrav/instabox-agent-workbench",
  },
] as const;

export function GitHubRepositoriesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label="Open project repositories on GitHub">
          <SimpleIcon icon={siGithub} className="fill-primary-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Project</DropdownMenuLabel>
          {repositories.map((repository) => (
            <DropdownMenuItem key={repository.href} asChild>
              <Link prefetch={false} href={repository.href} target="_blank" rel="noreferrer">
                {repository.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
