# Nemo Gateway bridge

This is a control-only VPS process. It invokes the existing OpenClaw Gateway
through the local CLI and never runs project commands on the VPS.

The caller must arrive through the Cloudflare Access service-token route. The
bridge checks the non-secret `CF-Access-Client-Id`; Cloudflare validates the
matching client secret before forwarding the request.

The dedicated `nemo` OpenClaw agent must allow only `node_exec`. Its prompt
requires every command to target the named Instabox node and remote `/data/`
workspace. Instabox remains responsible for repository files, tests, and
previews.

## Local verification

```sh
node --check bridge/server.mjs
NEMO_BRIDGE_ACCESS_CLIENT_ID=test node bridge/server.mjs
```

The bridge binds to loopback by default. Public reachability is supplied only
by the separately managed Cloudflare Tunnel + Access route.
