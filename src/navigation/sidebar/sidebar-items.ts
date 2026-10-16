import { Activity, Box, CirclePlay, GitBranch, type LucideIcon, Server, Settings2 } from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Workbench",
    items: [
      { id: "overview", title: "Overview", url: "/dashboard/default", icon: Activity },
      { id: "machines", title: "Machines", url: "/dashboard/default#machines", icon: Server },
      { id: "runs", title: "Runs", url: "/dashboard/default#runs", icon: CirclePlay },
      { id: "repositories", title: "Repositories", url: "/dashboard/default#repositories", icon: GitBranch },
    ],
  },
  {
    id: 2,
    label: "System",
    items: [
      { id: "templates", title: "Templates", url: "/dashboard/default#templates", icon: Box },
      { id: "settings", title: "Settings", url: "/dashboard/default#settings", icon: Settings2 },
    ],
  },
];
