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

The dashboard now checks the deployed control-plane health endpoint. Account data is exposed only through the protected
Worker contract at `GET /api/overview`; provider keys must never be placed in browser code or committed to this repository.

## Control plane

The separate `control-plane/` Worker is deployed as `nemo-control-plane.democow.workers.dev`.

- `GET /health` is a public capability check.
- `GET /api/overview` requires `Authorization: Bearer <NEMO_CONTROL_TOKEN>` and reads Instabox with the protected
  `INSTABOX_API_KEY` Worker secret.
- Machine mutations are intentionally disabled in this milestone.
- The frontend stays static on Pages; the Worker is the only provider integration boundary.

## Execution plan

The complete delivery plan is documented in [`docs/execution-plan.md`](./docs/execution-plan.md):

1. **Foundation and read-only connectivity** — current phase; contract, protected overview, live account status, and deployment proof.
2. **Controlled run orchestration** — repository/task selection, isolated machine creation, lifecycle controls, and idempotency.
3. **Agent results and production workflow** — agent execution, logs, tests, previews, persistence, GitHub status, and release gates.

Phase 1 contract validation runs with:

```sh
npm run validate:contract
```
