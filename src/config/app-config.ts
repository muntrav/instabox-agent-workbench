import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Nemo",
  version: packageJson.version,
  copyright: `© ${currentYear}, Nemo.`,
  meta: {
    title: "Nemo: Instabox Agent Workbench",
    description: "A focused control surface for isolated Instabox coding agents, machines, runs, and previews.",
  },
};
