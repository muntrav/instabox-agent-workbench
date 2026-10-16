# Nemo

Nemo is a focused control surface for isolated Instabox coding agents.

The project keeps the boundaries explicit:

- **GitHub** is the source of truth for repositories, branches, reviews, and CI.
- **Instabox** is the execution boundary for agent machines, tests, and temporary previews.
- **Cloudflare** is the release boundary for approved frontend previews and production deployments.

This repository started from [Studio Admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard), an MIT-licensed
Next.js and shadcn/ui dashboard template. The upstream `LICENSE` notice is retained.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Biome

## Local development

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then choose **Open workbench**.

## Checks

```sh
npm run check
npm run build
```

## Preview deployment

The GitHub `main` branch is connected to the private Cloudflare Pages project `nemo-agent-workbench`.
The connected Pages URL is `https://nemo-agent-workbench.pages.dev`.
This first milestone is a frontend-only shell; Instabox API actions remain behind a protected control-plane boundary.

## Runtime boundary

The current dashboard is a frontend-only preview. Dynamic Instabox and GitHub calls must be added through a protected
server-side control plane; provider keys must never be placed in browser code or committed to this repository.
