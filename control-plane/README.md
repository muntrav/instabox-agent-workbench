# Nemo control plane

This is the server-side boundary for Instabox account reads. It is deliberately
separate from the static Cloudflare Pages frontend.

## Contract

- `GET /health` is public and reports only capability state.
- `GET /api/overview` requires `Authorization: Bearer <NEMO_CONTROL_TOKEN>`.
- The Worker reads `INSTABOX_API_KEY` and never returns it to the browser.
- Machine mutations are disabled in this milestone and return `403`.

## Deployment

Worker name: `nemo-control-plane`

Required protected Worker secrets:

- `INSTABOX_API_KEY`: the Instabox key, restricted to read access where possible.
- `NEMO_CONTROL_TOKEN`: a separate, long random token used by an authenticated Nemo client. Do not reuse the Instabox key.

The Worker is deployed independently from Pages. The frontend may call `/health`
without credentials, but account data stays unavailable until a proper Nemo
authentication/session boundary is configured.
