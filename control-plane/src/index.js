const INSTABOX_ORIGIN = "https://api.instabox.sh";
const VERSION = "0.1.0";

const defaultOrigins = new Set([
  "https://nemo-agent-workbench.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const configured = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const origins = configured.length > 0 ? new Set(configured) : defaultOrigins;
  return origin && origins.has(origin) ? origin : "";
}

function json(data, status, request, env) {
  const origin = allowedOrigin(request, env);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };

  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-headers"] = "authorization, content-type, idempotency-key";
    headers["access-control-allow-methods"] = "GET, OPTIONS";
    headers.vary = "Origin";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function unauthorized(request, env) {
  return json({ error: "unauthorized", message: "A Nemo control-plane token is required." }, 401, request, env);
}

function authConfigured(env) {
  return typeof env.NEMO_CONTROL_TOKEN === "string" && env.NEMO_CONTROL_TOKEN.length >= 24;
}

function isAuthorized(request, env) {
  if (!authConfigured(env)) return false;

  const header = request.headers.get("Authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token || token.length !== env.NEMO_CONTROL_TOKEN.length) return false;

  let difference = 0;
  for (let index = 0; index < token.length; index += 1) {
    difference |= token.charCodeAt(index) ^ env.NEMO_CONTROL_TOKEN.charCodeAt(index);
  }
  return difference === 0;
}

async function instabox(path, env) {
  const response = await fetch(`${INSTABOX_ORIGIN}${path}`, {
    headers: {
      Accept: "application/json",
      "X-API-Key": env.INSTABOX_API_KEY,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    const error = new Error("Instabox request failed");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function latestVisibleTemplates(body) {
  const visible = (body.templates || []).filter((template) => !template.hidden);
  const latest = new Map();
  for (const template of visible) {
    const current = latest.get(template.id);
    if (!current || String(template.version).localeCompare(String(current.version), undefined, { numeric: true }) > 0) {
      latest.set(template.id, template);
    }
  }
  return [...latest.values()].map((template) => ({
    id: template.id,
    version: template.version,
    digest: template.digest,
    capabilities: template.capabilities || [],
    spec: template.defaultSpec || null,
  }));
}

async function overview(request, env) {
  if (!authConfigured(env)) {
    return json(
      {
        error: "control_plane_auth_not_configured",
        message: "Set the NEMO_CONTROL_TOKEN Worker secret before enabling account data.",
      },
      503,
      request,
      env,
    );
  }
  if (!isAuthorized(request, env)) return unauthorized(request, env);
  if (!env.INSTABOX_API_KEY) {
    return json({ error: "instabox_key_not_configured" }, 503, request, env);
  }

  try {
    const [me, usage, templates, machines] = await Promise.all([
      instabox("/v1/me", env),
      instabox("/v1/usage", env),
      instabox("/v1/templates", env),
      instabox("/v1/machines?limit=100", env),
    ]);

    return json(
      {
        version: VERSION,
        readOnly: true,
        account: { login: me.login, name: me.name, userId: me.userId },
        usage,
        templates: latestVisibleTemplates(templates),
        machines: machines.machines || [],
        nextCursor: machines.nextCursor || null,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    return json(
      {
        error: "instabox_unavailable",
        status: error.status || 502,
        message: "The Instabox account could not be read.",
      },
      502,
      request,
      env,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200, request, env);
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json(
        {
          service: "nemo-control-plane",
          version: VERSION,
          capabilities: {
            instaboxRead: Boolean(env.INSTABOX_API_KEY),
            accountData: authConfigured(env),
            mutations: false,
          },
        },
        200,
        request,
        env,
      );
    }

    if (url.pathname === "/api/overview" && request.method === "GET") {
      return overview(request, env);
    }

    if (url.pathname.startsWith("/api/") && request.method !== "GET") {
      return json(
        { error: "mutations_disabled", message: "Machine mutations are intentionally disabled in this milestone." },
        403,
        request,
        env,
      );
    }

    return json({ error: "not_found" }, 404, request, env);
  },
};
