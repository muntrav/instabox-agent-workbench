import type { Metadata } from "next";

import { NemoDashboard } from "./_components/nemo-dashboard";

export const metadata: Metadata = {
  title: "Nemo Workbench",
  description: "Run isolated Instabox coding agents and review their results.",
  alternates: {
    canonical: "/dashboard/default",
  },
};

export default function Page() {
  return <NemoDashboard />;
}
