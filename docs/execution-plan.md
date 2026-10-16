# Nemo execution plan

Nemo is delivered in three deliberately separated phases. GitHub remains the source of truth, Instabox is the execution boundary, and Cloudflare is the release boundary.

## Phase 1 — Foundation and read-only connectivity

**Goal:** make the frontend/API boundary reproducible and prove that Nemo can safely read the Instabox account without exposing provider credentials.

Scope:

- Keep the Pages frontend static and the control plane in a separate Worker.
- Define and validate the versioned `v1` control-plane contract for health and account overview.
- Keep `INSTABOX_API_KEY` and `NEMO_CONTROL_TOKEN` in Worker secrets only.
- Verify CORS, unauthorised access, authenticated overview access, and the live Pages artifact.
- Render live account, template, usage, and machine data when a session is connected.
- Keep all machine mutations disabled.

Exit gate:

- `npm run check`, `npm run build`, and `npm run validate:contract` pass.
- The intended GitHub commit is published to Pages.
- `/health` is externally reachable, unauthorised overview access is rejected, and an authenticated overview returns account data.
- No project workload runs on the control plane or VPS.

## Phase 2 — Controlled run orchestration

**Goal:** launch one isolated coding run from a selected GitHub repository.

Scope:

- Add a protected run API with request validation and idempotency keys.
- Select repository, branch/commit, task, template, and optional preview port.
- Create an Instabox machine, clone the repository, and record the run state.
- Add explicit confirmation before resource-creating actions.
- Add suspend/resume/delete lifecycle actions with audit events and failure recovery.

Exit gate:

- A run can be created, observed, and safely cleaned up end-to-end.
- Repeated requests do not create duplicate machines.
- Secrets remain server-side and the VPS performs orchestration only.

## Phase 3 — Agent results and production workflow

**Goal:** make runs useful for ongoing development and review.

Scope:

- Add agent execution, streamed logs, test results, and preview URLs.
- Persist run history and artifacts in a durable store.
- Add GitHub repository/branch/commit status and CI links.
- Add review/approval states before publishing changes.
- Add retention, quotas, rate limits, observability, and incident recovery.

Exit gate:

- A completed run has reproducible provenance from repository commit to result.
- Preview and production deployment remain separate release gates.
- Failed or abandoned runs are recoverable without orphaned resources.

## Current status

Phase 1 is the active implementation phase. The live UI is deployed at `https://nemo-agent-workbench.pages.dev` and the control plane is `https://nemo-control-plane.democow.workers.dev`. Phase 2 is intentionally blocked until Phase 1's authenticated read-only checks are verified.
