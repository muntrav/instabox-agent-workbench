# Nemo control plane

This is the server-side boundary for Nemo's Instabox orchestration. It is deliberately
separate from the static Cloudflare Pages frontend.

## Contract

- `GET /health` is public and reports only capability state.
- `GET /api/overview` requires `Authorization: Bearer <NEMO_CONTROL_TOKEN>`.
- The Worker reads `INSTABOX_API_KEY` and never returns it to the browser.
- `GET/POST /api/runs` queues and reads durable runs.
- `GET /api/runs/:id/logs` returns redacted persisted command output.
- `POST /api/runs/:id/actions` controls a run machine or publishes a preview URL.
- Resource-creating and destructive actions use Instabox idempotency keys; deletes require `X-Nemo-Confirm: true`.

## Deployment

Worker name: `nemo-control-plane`

Required protected Worker secrets:

- `INSTABOX_API_KEY`: the Instabox key, restricted to read access where possible.
- `NEMO_CONTROL_TOKEN`: a separate password longer than five characters used by an authenticated Nemo client. Do not reuse the Instabox key.
- `GITHUB_TOKEN`: optional protected GitHub token for private repositories; public repositories work without it.
- `NEMO_AGENT_COMMAND`: required protected command template for Phase 3. It must use `{task}` as the task argument and may use `{workspace}` and `{repository}`.

The Worker is deployed independently from Pages. The frontend may call `/health`
without credentials, but all account, run, log, and machine actions require the
Nemo session boundary. The D1 binding `NEMO_DB` stores run metadata, events, and
redacted logs. Project workloads execute only in Instabox machines.
