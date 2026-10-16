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

Phase 1 is complete. Phases 2 and 3 are implemented in the repository as the protected run API, D1 persistence, Instabox lifecycle adapter, command/log pipeline, preview publishing, and dashboard run controls. Activation of the Phase 3 agent path still requires the protected `NEMO_AGENT_COMMAND` runtime adapter; the Worker reports `agentRunner: false` until that secret is configured and the command is verified in the selected Instabox template.

## Gateway reuse activation

The Phase 3 runtime now uses a separate Cloudflare Access-protected VPS bridge.
The bridge invokes the existing OpenClaw Gateway provider configuration through
the local Gateway-routed CLI path; it never runs project commands on the VPS.
The restricted `nemo` agent may use only `node_exec`, and the target node must
be an explicitly paired Instabox node named by `NEMO_INSTABOX_NODE_NAME`.
Provider credentials remain on the Gateway. The bridge route and agent policy
are deployed; the remaining activation gate is pairing and verifying the
Instabox node, then setting the protected Worker node-name binding.

The protected `POST /api/nodes/provision` flow performs that activation: it
creates or reuses `nemo-gateway-node`, installs the OpenClaw node client,
connects through the Access-protected Gateway URL, and approves the pending
node. It does not transfer provider credentials to the machine.
