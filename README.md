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
The frontend remains a static Pages artifact; dynamic orchestration runs through the protected control-plane Worker.

## Runtime boundary

The dashboard now checks the deployed control-plane health endpoint. Account data is exposed only through the protected
Worker contract at `GET /api/overview`; provider keys must never be placed in browser code or committed to this repository.

## Control plane

The separate `control-plane/` Worker is deployed as `nemo-control-plane.democow.workers.dev`.

- `GET /health` is a public capability check.
- `GET /api/overview` requires `Authorization: Bearer <NEMO_CONTROL_TOKEN>` and reads Instabox with the protected
  `INSTABOX_API_KEY` Worker secret.
- Machine mutations require the Nemo session token and explicit action confirmation.
- The frontend stays static on Pages; the Worker is the only provider integration boundary.

## Execution plan

The complete delivery plan is documented in [`docs/execution-plan.md`](./docs/execution-plan.md):

1. **Foundation and read-only connectivity** — complete.
2. **Controlled run orchestration** — implemented: repository/task selection, isolated machine creation, lifecycle controls, durable run state, and idempotency.
3. **Agent results and production workflow** — implemented: durable runs, redacted logs, tests, commit provenance, previews, cleanup, and release-boundary documentation. The agent path reuses the existing OpenClaw Gateway through the protected VPS bridge; project commands execute only on a paired Instabox node.

Phase 1 contract validation runs with:

```sh
npm run validate:contract
```

## Run-linked agent chats

Each run card now has a **Chat** action. The first click creates one chat for that run; later clicks reopen it. The chat page
uses an edited implementation of Vercel Chatbot's conversation shell, message thread, and prompt composer, customized with
Nemo's existing design system, run context, and recent tool activity. Follow-up messages reuse the run's OpenClaw session
and dedicated Instabox node. The source basis is pinned and attributed in [`docs/third-party-notices.md`](./docs/third-party-notices.md).

Chats are intentionally ephemeral: suspending a machine preserves its chat, while successful machine deletion, cancellation,
or cleanup deletes the chat and messages from D1. See [`docs/chat-design.md`](./docs/chat-design.md) for the lifecycle and
API contract.

