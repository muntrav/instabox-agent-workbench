import { WorkflowEntrypoint } from "cloudflare:workers";

const INSTABOX_ORIGIN = "https://api.instabox.sh";
const VERSION = "0.6.0";
const MIN_CONTROL_TOKEN_LENGTH = 6;
const MAX_RUNS_PAGE = 50;
const WORKSPACE = "/data/home/workspace";
const DEFAULT_NODE_NAME = "Nemo Instabox";

const defaultOrigins = new Set([
  "https://nemo-agent-workbench.pages.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function now() {
  return new Date().toISOString();
}

function validRunId(value) {
  return typeof value === "string" && /^run_[A-Za-z0-9]+$/.test(value);
}

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
    headers["access-control-allow-headers"] = "authorization, content-type, idempotency-key, x-nemo-confirm";
    headers["access-control-allow-methods"] = "GET, POST, DELETE, OPTIONS";
    headers.vary = "Origin";
  }

  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(error, status, request, env, details = {}) {
  return json({ error, ...details }, status, request, env);
}

function authConfigured(env) {
  return typeof env.NEMO_CONTROL_TOKEN === "string" && env.NEMO_CONTROL_TOKEN.length >= MIN_CONTROL_TOKEN_LENGTH;
}

function isAuthorized(request, env) {
  if (!authConfigured(env)) return false;

  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer (.+)$/.exec(header);
  const token = match?.[1] || "";
  if (!token || token.length !== env.NEMO_CONTROL_TOKEN.length) return false;

  let difference = 0;
  for (let index = 0; index < token.length; index += 1) {
    difference |= token.charCodeAt(index) ^ env.NEMO_CONTROL_TOKEN.charCodeAt(index);
  }
  return difference === 0;
}

function requireAuth(request, env) {
  if (!authConfigured(env)) {
    return errorResponse("control_plane_auth_not_configured", 503, request, env, {
      message: "Set the NEMO_CONTROL_TOKEN Worker secret before using Nemo.",
    });
  }
  if (!isAuthorized(request, env)) {
    return errorResponse("unauthorized", 401, request, env, {
      message: "A Nemo control-plane token is required.",
    });
  }
  return null;
}

async function requestJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function redact(value) {
  return String(value || "")
    .replace(/ibk_[A-Za-z0-9_-]+/g, "ibk_[redacted]")
    .replace(/(ghp_|github_pat_|sk-|cf_)[A-Za-z0-9_-]+/g, "$1[redacted]")
    .replace(/https:\/\/nemo-gateway\.nywezalabs\.com\/j\/[A-Za-z0-9_-]+/g, "https://nemo-gateway.nywezalabs.com/j/[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function agentBridgeConfigured(env) {
  return Boolean(
    typeof env.NEMO_AGENT_BRIDGE_URL === "string" &&
      env.NEMO_AGENT_BRIDGE_URL.startsWith("https://") &&
      typeof env.NEMO_BRIDGE_ACCESS_CLIENT_ID === "string" &&
      env.NEMO_BRIDGE_ACCESS_CLIENT_ID.length > 10 &&
      typeof env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET === "string" &&
      env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET.length > 10,
  );
}

function bridgeCredentialsConfigured(env) {
  return Boolean(
    typeof env.NEMO_AGENT_BRIDGE_URL === "string" &&
      env.NEMO_AGENT_BRIDGE_URL.startsWith("https://") &&
      typeof env.NEMO_BRIDGE_ACCESS_CLIENT_ID === "string" &&
      env.NEMO_BRIDGE_ACCESS_CLIENT_ID.length > 10 &&
      typeof env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET === "string" &&
      env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET.length > 10,
  );
}

function githubRepository(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    const owner = parts[0];
    const name = parts[1].replace(/\.git$/, "");
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null;
    return { canonical: `https://github.com/${owner}/${name}.git`, owner, name };
  } catch {
    return null;
  }
}

function validRef(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value);
}

function normalizeRunInput(body) {
  if (!body || typeof body !== "object")
    return { kind: "error", error: "invalid_json", message: "A JSON request body is required." };

  const repository = githubRepository(body.repositoryUrl);
  if (!repository) {
    return {
      kind: "error",
      error: "invalid_repository",
      message: "repositoryUrl must be an HTTPS GitHub repository URL.",
    };
  }
  if (typeof body.task !== "string" || body.task.trim().length < 5 || body.task.length > 4000) {
    return { kind: "error", error: "invalid_task", message: "task must contain 5 to 4000 characters." };
  }

  const ref = body.ref || "main";
  if (!validRef(ref)) return { kind: "error", error: "invalid_ref", message: "ref contains unsupported characters." };

  const templateId = body.templateId || "universal";
  if (typeof templateId !== "string" || templateId.length > 100 || !/^[A-Za-z0-9_.:-]+$/.test(templateId)) {
    return { kind: "error", error: "invalid_template", message: "templateId is invalid." };
  }

  const previewPort = body.previewPort == null ? null : Number(body.previewPort);
  if (previewPort != null && (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535)) {
    return {
      kind: "error",
      error: "invalid_preview_port",
      message: "previewPort must be an integer from 1024 to 65535.",
    };
  }

  return {
    kind: "ok",
    value: {
      repositoryUrl: repository.canonical,
      repositoryOwner: repository.owner,
      repositoryName: repository.name,
      ref,
      task: body.task.trim(),
      templateId,
      previewPort,
      retainMachine: Boolean(body.retainMachine || previewPort),
    },
  };
}

function dbRequired(env) {
  if (!env.NEMO_DB) throw new Error("NEMO_DB is not configured");
  return env.NEMO_DB;
}

async function findRun(env, id) {
  const result = await dbRequired(env).prepare("SELECT * FROM runs WHERE id = ?1").bind(id).first();
  return result || null;
}

function runPublic(row) {
  if (!row) return null;
  let result = null;
  try {
    result = row.result_json ? JSON.parse(row.result_json) : null;
  } catch {
    result = null;
  }
  return {
    id: row.id,
    repositoryUrl: row.repository_url,
    repositoryOwner: row.repository_owner,
    repositoryName: row.repository_name,
    ref: row.ref_name,
    task: row.task,
    templateId: row.template_id,
    previewPort: row.preview_port,
    previewUrl: row.preview_url,
    machineId: row.machine_id,
    nodeName: row.node_name,
    nodeStatus: row.node_status,
    nodePairedAt: row.node_paired_at,
    commitSha: row.commit_sha,
    status: row.status,
    agentStatus: row.agent_status,
    testStatus: row.test_status,
    exitCode: row.exit_code,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function updateRun(env, id, patch) {
  const allowed = new Set([
    "machine_id",
    "node_name",
    "node_status",
    "node_paired_at",
    "commit_sha",
    "preview_url",
    "status",
    "agent_status",
    "test_status",
    "exit_code",
    "error_code",
    "error_message",
    "result_json",
    "updated_at",
    "started_at",
    "completed_at",
  ]);
  const entries = Object.entries(patch).filter(([key, value]) => allowed.has(key) && value !== undefined);
  if (!entries.length) return;
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `${key} = ?${index + 1}`).join(", ");
  await dbRequired(env)
    .prepare(`UPDATE runs SET ${assignments} WHERE id = ?${values.length + 1}`)
    .bind(...values, id)
    .run();
}

async function appendEvent(env, runId, eventType, payload = {}) {
  await dbRequired(env)
    .prepare("INSERT INTO run_events (run_id, event_type, payload_json, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(runId, eventType, JSON.stringify(payload), now())
    .run();
}

async function appendLog(env, runId, stream, chunk) {
  const clean = redact(chunk);
  if (!clean) return;
  await dbRequired(env)
    .prepare("INSERT INTO run_logs (run_id, stream, chunk, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(runId, stream, clean.slice(0, 20000), now())
    .run();
}

async function instabox(path, env, options = {}) {
  if (!env.INSTABOX_API_KEY) {
    throw Object.assign(new Error("Instabox key is not configured"), {
      code: "instabox_key_not_configured",
      status: 503,
    });
  }
  const headers = {
    Accept: "application/json",
    "X-API-Key": env.INSTABOX_API_KEY,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  const response = await fetch(`${INSTABOX_ORIGIN}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw Object.assign(new Error("Instabox request failed"), {
      status: response.status,
      code: body?.code || "instabox_error",
      body,
    });
  }
  return body;
}

async function waitOperation(operationIdValue, env) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const operation = await instabox(`/v1/operations/${encodeURIComponent(operationIdValue)}?wait=25s`, env);
    const state = operation?.state || operation?.status;
    if (state === "succeeded" || state === "success" || state === "completed") return operation;
    if (state === "failed" || state === "error") {
      throw Object.assign(new Error("Instabox operation failed"), {
        code: operation?.error?.code || "operation_failed",
        status: 502,
        body: operation,
      });
    }
  }
  throw Object.assign(new Error("Instabox operation timed out"), { code: "operation_timeout", status: 504 });
}

function operationId(body) {
  return (
    body?.operation?.id ||
    body?.operationId ||
    (typeof body?.id === "string" && body.id.startsWith("op_") ? body.id : null)
  );
}

function machineId(body) {
  return (
    body?.machine?.id ||
    body?.machineId ||
    body?.result?.machine?.id ||
    body?.result?.machineId ||
    (typeof body?.id === "string" && body.id.startsWith("m_") ? body.id : null)
  );
}

function runNodeName(runId) {
  return `nemo-run-${runId}`;
}

async function createMachine(run, env) {
  const body = await instabox("/v1/machines", env, {
    method: "POST",
    idempotencyKey: `nemo-${run.id}`,
    body: {
      name: `nemo-${run.id.replaceAll("_", "-").slice(-24)}`,
      templateId: run.template_id,
      timeoutSeconds: 3600,
      metadata: { nemoRun: run.id, repository: run.repository_name || "github" },
      vault: false,
    },
  });
  const operation = operationId(body) ? await waitOperation(operationId(body), env) : body;
  const id = machineId(body) || machineId(operation);
  if (!id)
    throw Object.assign(new Error("Instabox did not return a machine ID"), { code: "machine_id_missing", status: 502 });
  return { id, operation };
}

async function machineCommand(env, runId, machine, cmd, timeoutSeconds = 600, options = {}) {
  const result = await instabox(`/v1/machines/${encodeURIComponent(machine)}/exec`, env, {
    method: "POST",
    body: {
      cmd,
      timeoutSeconds,
      ...(options.envs ? { envs: options.envs } : {}),
      ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
    },
  });
  await appendLog(env, runId, "stdout", result?.stdout || "");
  await appendLog(env, runId, "stderr", result?.stderr || "");
  return result || {};
}

async function pairMachineNode(env, machineIdValue, nodeName, runId = null) {
  const join = await bridgeRequest(env, "/v1/node/join", { nodeName });
  const joinUrl = join?.joinUrl || join?.url || join?.result?.joinUrl;
  if (typeof joinUrl !== "string") {
    throw Object.assign(new Error("The Gateway bridge did not return a pairing URL"), {
      code: "gateway_join_url_missing",
      status: 502,
    });
  }
  const setupCode = await fetchJoinSetupCode(env, joinUrl);
  const command = await instabox(`/v1/machines/${encodeURIComponent(machineIdValue)}/exec`, env, {
    method: "POST",
    body: {
      cmd: [
        "set -eu",
        "NODE_VERSION=24.16.0; NODE_DIR=\"$HOME/.local/node-v$NODE_VERSION-linux-x64\"; if [ ! -x \"$NODE_DIR/bin/node\" ]; then mkdir -p \"$HOME/.local\"; curl -fsSL \"https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz\" | tar -xJ -C \"$HOME/.local\"; fi; export PATH=\"$NODE_DIR/bin:$HOME/.local/bin:$PATH\"",
        "npm install --prefix \"$HOME/.local\" --global openclaw@2026.9.3; OPENCLAW_BIN=\"$HOME/.local/bin/openclaw\"",
        "TARGET_FILE=\"$HOME/.nemo-openclaw-join\"; umask 077; cat > \"$TARGET_FILE\"",
        `nohup \"$OPENCLAW_BIN\" connect --target-file \"$TARGET_FILE\" --display-name ${shellQuote(nodeName)} > \"$HOME/.nemo-openclaw-connect.log\" 2>&1 </dev/null & echo $!`,
      ].join("; "),
      timeoutSeconds: 600,
      envs: {
        CF_ACCESS_CLIENT_ID: env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
        CF_ACCESS_CLIENT_SECRET: env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET,
      },
      stdin: `${setupCode}\n`,
    },
  });
  if (runId) {
    await appendLog(env, runId, "node", command?.stdout || "");
    await appendLog(env, runId, "node", command?.stderr || "");
  }
  if (commandFailed(command)) {
    const detail = redact(command?.stderr || command?.stdout || "").trim().slice(-600);
    throw Object.assign(new Error(detail || "The Instabox node client could not connect"), {
      code: "node_connect_failed",
      status: 502,
    });
  }
  const approval = await bridgeRequest(env, "/v1/node/approve", { nodeName });
  if (approval.approved !== true || approval.connected !== true) {
    throw Object.assign(new Error("The Instabox run node did not become connected"), {
      code: "node_pairing_incomplete",
      status: 502,
    });
  }
  return approval;
}

async function bridgeRequest(env, path, body) {
  if (!bridgeCredentialsConfigured(env)) {
    throw Object.assign(new Error("The OpenClaw Gateway bridge is not configured"), {
      code: "gateway_bridge_not_configured",
      status: 503,
    });
  }
  const response = await fetch(`${env.NEMO_AGENT_BRIDGE_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "content-type": "application/json",
      "CF-Access-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET,
      "X-Nemo-Bridge-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
    },
    body: JSON.stringify(body || {}),
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }
  if (!response.ok || !result || typeof result !== "object") {
    throw Object.assign(
      new Error(
        result?.message ||
          result?.error ||
          `Gateway bridge returned HTTP ${response.status} (${response.headers.get("content-type") || "unknown content type"})`,
      ),
      {
        code: result?.error || "gateway_bridge_failed",
      status: response.status || 502,
      },
    );
  }
  return result || {};
}

function encodeSetupPayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `oc-pair://${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")}`;
}

async function fetchJoinSetupCode(env, joinUrl) {
  const response = await fetch(joinUrl, {
    headers: {
      Accept: "application/json",
      "CF-Access-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET,
      "X-Nemo-Bridge-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload !== "object") {
    throw Object.assign(new Error("The Gateway pairing payload could not be fetched"), {
      code: "gateway_join_payload_failed",
      status: response.status || 502,
    });
  }
  if (typeof payload.bootstrapToken !== "string" || payload.bootstrapToken.length < 1) {
    throw Object.assign(new Error(`The Gateway pairing payload is missing bootstrapToken (fields: ${Object.keys(payload).join(",") || "none"})`), {
      code: "gateway_join_payload_invalid",
      status: 502,
    });
  }
  const publicGateway = new URL(joinUrl);
  publicGateway.protocol = "wss:";
  publicGateway.pathname = "/";
  publicGateway.search = "";
  publicGateway.hash = "";
  const publicGatewayUrl = publicGateway.toString().replace(/\/$/, "");
  return encodeSetupPayload({
    ...payload,
    url: publicGatewayUrl,
    urls: [publicGatewayUrl],
  });
}

function machineRows(body) {
  if (Array.isArray(body)) return body;
  return Array.isArray(body?.machines) ? body.machines : Array.isArray(body?.results) ? body.results : [];
}

function commandFailed(result) {
  const code = result?.exitCode ?? result?.code ?? result?.statusCode;
  return (code !== undefined && code !== null && Number(code) !== 0) || result?.status === "failed";
}

async function provisionNode(request, env) {
  if (!env.INSTABOX_API_KEY)
    return errorResponse("instabox_key_not_configured", 503, request, env, {
      message: "Instabox write access is not configured.",
    });
  if (!bridgeCredentialsConfigured(env))
    return errorResponse("gateway_bridge_not_configured", 503, request, env, {
      message: "The protected OpenClaw Gateway bridge is not configured.",
    });

  const nodeName = "Nemo Instabox";
  const machineName = "nemo-gateway-node";
  let machine = null;
  let created = false;
  try {
    const existing = machineRows(await instabox("/v1/machines?limit=100", env)).find(
      (item) => item?.name === machineName || item?.metadata?.role === "nemo-gateway-node",
    );
    if (existing?.id) {
      machine = existing;
    } else {
      const createdBody = await instabox("/v1/machines", env, {
        method: "POST",
        idempotencyKey: "nemo-gateway-node-v2",
        body: {
          name: machineName,
          templateId: "universal",
          timeoutSeconds: 86400,
          metadata: { role: "nemo-gateway-node", nodeName },
          vault: false,
        },
      });
      const operation = operationId(createdBody) ? await waitOperation(operationId(createdBody), env) : createdBody;
      const id = machineId(createdBody) || machineId(operation);
      if (!id) throw Object.assign(new Error("Instabox did not return a node machine ID"), { status: 502 });
      machine = { id, name: machineName };
      created = true;
    }

    const approval = await pairMachineNode(env, machine.id, nodeName);
    return json(
      {
        nodeName,
        machineId: machine.id,
        machineName,
        paired: approval.approved === true,
        created,
      },
      200,
      request,
      env,
    );
  } catch (error) {
    if (created && machine?.id) {
      try {
        await instabox(`/v1/machines/${encodeURIComponent(machine.id)}`, env, {
          method: "DELETE",
          idempotencyKey: "nemo-gateway-node-cleanup-v1",
        });
      } catch {
        // Preserve the original provisioning error; cleanup can be retried from the machine list.
      }
    }
    return errorResponse(error.code || "node_provision_failed", error.status || 502, request, env, {
      message: redact(error.message),
    });
  }
}

async function runRemoteAgent(env, run) {
  if (!agentBridgeConfigured(env)) {
    throw Object.assign(new Error("The OpenClaw Gateway bridge is not configured"), {
      code: "agent_bridge_not_configured",
      status: 503,
    });
  }
  const response = await fetch(`${env.NEMO_AGENT_BRIDGE_URL.replace(/\/$/, "")}/v1/agent/turn`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "content-type": "application/json",
      "CF-Access-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": env.NEMO_BRIDGE_ACCESS_CLIENT_SECRET,
      "X-Nemo-Bridge-Client-Id": env.NEMO_BRIDGE_ACCESS_CLIENT_ID,
    },
    body: JSON.stringify({
      runId: run.id,
      nodeName: run.node_name || env.NEMO_INSTABOX_NODE_NAME || DEFAULT_NODE_NAME,
      workspace: WORKSPACE,
      repositoryUrl: run.repository_url,
      ref: run.ref_name,
      task: run.task,
    }),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.result) {
    throw Object.assign(new Error(body?.message || body?.detail || "The OpenClaw agent bridge failed"), {
      code: body?.error || "agent_bridge_failed",
      status: response.status || 502,
    });
  }
  return body;
}

function testCommand() {
  return [
    "set -eu",
    "cd /data/home/workspace",
    "if [ -f package.json ] && node -e \"process.exit(require('./package.json').scripts?.test ? 0 : 1)\"; then npm test -- --runInBand;",
    "elif [ -f pyproject.toml ]; then pytest -q;",
    "elif [ -f Cargo.toml ]; then cargo test;",
    "else echo 'No recognized test command; recording a skipped test.'; fi",
  ].join("; ");
}

async function publishPreview(env, run) {
  if (!run.preview_port) return null;
  const body = await instabox(`/v1/machines/${encodeURIComponent(run.machine_id)}/ports`, env, {
    method: "POST",
    body: { port: run.preview_port, name: `Nemo ${run.repository_name || run.id}` },
  });
  return body?.url || body?.port?.url || body?.publicUrl || null;
}

async function deleteMachine(env, machine, idempotencyKey) {
  const body = await instabox(`/v1/machines/${encodeURIComponent(machine)}`, env, {
    method: "DELETE",
    idempotencyKey,
  });
  const operation = operationId(body);
  if (operation) await waitOperation(operation, env);
}

async function removeRunNode(env, runId, nodeName) {
  if (!nodeName) return;
  try {
    await bridgeRequest(env, "/v1/node/remove", { nodeName });
    await appendEvent(env, runId, "node_removed", { nodeName });
  } catch {
    await appendEvent(env, runId, "node_remove_failed", { nodeName });
  }
}

async function executeRun(runId, env) {
  const run = await findRun(env, runId);
  if (!run) return;
  let machine = null;
  let nodeName = null;
  try {
    await updateRun(env, runId, {
      status: "provisioning",
      agent_status: "queued",
      updated_at: now(),
      started_at: now(),
    });
    await appendEvent(env, runId, "run_started");

    const created = await createMachine(run, env);
    machine = created.id;
    nodeName = runNodeName(run.id);
    await updateRun(env, runId, {
      machine_id: machine,
      node_name: nodeName,
      node_status: "pairing",
      status: "preparing",
      updated_at: now(),
    });
    await appendEvent(env, runId, "machine_created", { machineId: machine });
    await appendEvent(env, runId, "node_pairing_started", { nodeName });
    await pairMachineNode(env, machine, nodeName, runId);
    await updateRun(env, runId, { node_status: "connected", node_paired_at: now(), updated_at: now() });
    await appendEvent(env, runId, "node_paired", { nodeName, machineId: machine });

    const cloneUrl = env.GITHUB_TOKEN
      ? `https://x-access-token:$GITHUB_TOKEN@github.com/${run.repository_owner}/${run.repository_name}.git`
      : run.repository_url;
    const cloneSource = env.GITHUB_TOKEN ? `"${cloneUrl}"` : shellQuote(cloneUrl);
    const clone = await machineCommand(
      env,
      runId,
      machine,
      `set -eu; rm -rf ${shellQuote(WORKSPACE)}; git clone --depth 1 --branch ${shellQuote(run.ref_name)} ${cloneSource} ${shellQuote(WORKSPACE)}; git -C ${shellQuote(WORKSPACE)} rev-parse HEAD`,
      600,
      env.GITHUB_TOKEN ? { envs: { GITHUB_TOKEN: env.GITHUB_TOKEN } } : {},
    );
    const commitSha = String(clone.stdout || "")
      .trim()
      .split(/\s+/)
      .pop();
    await updateRun(env, runId, {
      commit_sha: /^[a-f0-9]{7,64}$/i.test(commitSha) ? commitSha : null,
      status: "running",
      agent_status: "running",
      updated_at: now(),
    });
    await appendEvent(env, runId, "repository_ready", { commitSha });

    const agent = await runRemoteAgent(env, { ...run, node_name: nodeName });
    await appendLog(env, runId, "agent", agent.result);
    await updateRun(env, runId, { agent_status: "succeeded", status: "testing", updated_at: now() });
    await appendEvent(env, runId, "agent_completed");

    const tests = await machineCommand(env, runId, machine, testCommand());
    const testExitCode = Number(tests.exitCode || 0);
    await updateRun(env, runId, {
      test_status: testExitCode === 0 ? "succeeded" : "failed",
      exit_code: testExitCode,
      updated_at: now(),
    });
    if (testExitCode !== 0)
      throw Object.assign(new Error("Project tests failed"), {
        code: "tests_failed",
        status: 422,
        exitCode: testExitCode,
      });
    await appendEvent(env, runId, "tests_completed", { exitCode: testExitCode });

    const latest = await findRun(env, runId);
    let previewUrl = null;
    if (latest?.preview_port) {
      await machineCommand(
        env,
        runId,
        machine,
        `set -eu; cd ${shellQuote(WORKSPACE)}; (npm run dev -- --host 0.0.0.0 > /tmp/nemo-preview.log 2>&1 &)`,
        30,
      );
      previewUrl = await publishPreview(env, latest);
    }

    const result = { previewUrl, retainedMachine: Boolean(latest?.retain_machine), commitSha };
    await updateRun(env, runId, {
      preview_url: previewUrl,
      result_json: JSON.stringify(result),
      status: "completed",
      agent_status: "succeeded",
      test_status: "succeeded",
      updated_at: now(),
      completed_at: now(),
    });
    await appendEvent(env, runId, "run_completed", result);

    if (!latest?.retain_machine) {
      await removeRunNode(env, runId, nodeName);
      await deleteMachine(env, machine, `nemo-cleanup-${runId}`);
      await appendEvent(env, runId, "machine_cleaned");
    }
  } catch (error) {
    const code = error.code || "run_failed";
    const message = redact(error.message || "The run failed.");
    await updateRun(env, runId, {
      status: "failed",
      agent_status:
        code === "agent_failed" ||
        code === "agent_runtime_not_configured" ||
        code === "agent_bridge_not_configured" ||
        code === "agent_bridge_failed"
          ? "failed"
          : undefined,
      test_status: code === "tests_failed" ? "failed" : undefined,
      exit_code: error.exitCode ?? null,
      error_code: code,
      error_message: message.slice(0, 500),
      updated_at: now(),
      completed_at: now(),
    });
    await appendEvent(env, runId, "run_failed", { code, message: message.slice(0, 500) });
    if (machine) {
      if (!run?.retain_machine) await removeRunNode(env, runId, nodeName);
      try {
        await deleteMachine(env, machine, `nemo-failed-cleanup-${runId}`);
        await appendEvent(env, runId, "machine_cleaned_after_failure");
      } catch {
        await appendEvent(env, runId, "machine_cleanup_failed");
      }
    }
  }
}

export class NemoRunWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const runId = event?.payload?.runId;
    if (!validRunId(runId)) throw new Error("Workflow payload is missing a valid run ID");
    await step.do("execute Nemo run", async () => {
      await executeRun(runId, this.env);
      return { runId };
    });
  }
}

async function listRuns(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), MAX_RUNS_PAGE);
  const result = await dbRequired(env)
    .prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?1")
    .bind(limit)
    .all();
  return json({ runs: (result.results || []).map(runPublic) }, 200, request, env);
}

async function getRun(request, env, runId) {
  const run = await findRun(env, runId);
  if (!run) return errorResponse("run_not_found", 404, request, env, { message: "The requested run does not exist." });
  return json({ run: runPublic(run) }, 200, request, env);
}

async function getLogs(request, env, runId) {
  const run = await findRun(env, runId);
  if (!run) return errorResponse("run_not_found", 404, request, env, { message: "The requested run does not exist." });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 500);
  const result = await dbRequired(env)
    .prepare(
      "SELECT id, stream, chunk, created_at AS createdAt FROM run_logs WHERE run_id = ?1 ORDER BY id DESC LIMIT ?2",
    )
    .bind(runId, limit)
    .all();
  return json({ logs: (result.results || []).reverse() }, 200, request, env);
}

async function createRun(request, env, ctx) {
  if (!env.NEMO_DB)
    return errorResponse("database_not_configured", 503, request, env, {
      message: "Nemo persistence is not configured.",
    });
  if (!env.INSTABOX_API_KEY)
    return errorResponse("instabox_key_not_configured", 503, request, env, {
      message: "Instabox write access is not configured.",
    });
  if (!agentBridgeConfigured(env)) {
    return errorResponse("agent_bridge_not_configured", 503, request, env, {
      message: "The OpenClaw Gateway bridge and Instabox node are not configured.",
    });
  }
  if (!env.NEMO_RUN_WORKFLOW?.create) {
    return errorResponse("workflow_not_configured", 503, request, env, {
      message: "Durable run execution is not configured.",
    });
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    return errorResponse("idempotency_key_required", 400, request, env, {
      message: "Every run creation requires a stable Idempotency-Key.",
    });
  }
  const existing = await dbRequired(env)
    .prepare("SELECT * FROM runs WHERE idempotency_key = ?1")
    .bind(idempotencyKey)
    .first();
  if (existing) return json({ run: runPublic(existing), idempotent: true }, 200, request, env);

  const normalized = normalizeRunInput(await requestJson(request));
  if (normalized.kind === "error")
    return errorResponse(normalized.error, 400, request, env, {
      message: normalized.message,
    });
  const input = normalized.value;
  const id = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const timestamp = now();
  await dbRequired(env)
    .prepare(
      `INSERT INTO runs (id, idempotency_key, repository_url, repository_owner, repository_name, ref_name, task, template_id, preview_port, retain_machine, status, agent_status, test_status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'queued', 'queued', 'pending', ?11, ?11)`,
    )
    .bind(
      id,
      idempotencyKey,
      input.repositoryUrl,
      input.repositoryOwner,
      input.repositoryName,
      input.ref,
      input.task,
      input.templateId,
      input.previewPort,
      input.retainMachine ? 1 : 0,
      timestamp,
    )
    .run();
  await appendEvent(env, id, "run_queued", { repository: input.repositoryUrl, ref: input.ref });
  await env.NEMO_RUN_WORKFLOW.create({ id, params: { runId: id } });
  const run = await findRun(env, id);
  return json({ run: runPublic(run) }, 202, request, env);
}

async function machineAction(request, env, ctx, runId) {
  const run = await findRun(env, runId);
  if (!run) return errorResponse("run_not_found", 404, request, env, { message: "The requested run does not exist." });
  if (!run.machine_id)
    return errorResponse("machine_not_ready", 409, request, env, { message: "This run has no machine yet." });
  const body = await requestJson(request);
  const action = body?.action;
  const allowed = new Set(["suspend", "resume", "stop", "delete", "cancel", "publish-preview"]);
  if (!allowed.has(action))
    return errorResponse("invalid_action", 400, request, env, { message: "Unsupported machine action." });
  if ((action === "delete" || action === "cancel") && request.headers.get("X-Nemo-Confirm") !== "true") {
    return errorResponse("confirmation_required", 409, request, env, {
      message: "Destructive actions require X-Nemo-Confirm: true.",
    });
  }

  if (action === "publish-preview") {
    const port = Number(body?.port || run.preview_port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      return errorResponse("invalid_preview_port", 400, request, env, { message: "A valid preview port is required." });
    }
    try {
      const result = await instabox(`/v1/machines/${encodeURIComponent(run.machine_id)}/ports`, env, {
        method: "POST",
        body: { port, name: body?.name || `Nemo ${run.repository_name || run.id}` },
      });
      const previewUrl = result?.url || result?.port?.url || result?.publicUrl || null;
      await updateRun(env, runId, { preview_url: previewUrl, updated_at: now() });
      await appendEvent(env, runId, "preview_published", { port, previewUrl });
      return json({ run: runPublic(await findRun(env, runId)), previewUrl }, 200, request, env);
    } catch {
      return errorResponse("preview_publish_failed", 502, request, env, {
        message: "The preview port could not be published.",
      });
    }
  }

  const path =
    action === "cancel" || action === "delete" ? null : `/v1/machines/${encodeURIComponent(run.machine_id)}/${action}`;
  ctx.waitUntil(
    (async () => {
      try {
        if (action === "cancel" || action === "delete") {
          await removeRunNode(env, runId, run.node_name);
          await deleteMachine(env, run.machine_id, `nemo-${action}-${runId}`);
          await updateRun(env, runId, {
            status: action === "cancel" ? "cancelled" : "cleaned",
            node_status: "removed",
            updated_at: now(),
            completed_at: now(),
          });
        } else {
          const result = await instabox(path, env, {
            method: "POST",
            idempotencyKey: `nemo-${action}-${runId}`,
            body: {},
          });
          const operation = operationId(result);
          if (operation) await waitOperation(operation, env);
        }
        await appendEvent(env, runId, `machine_${action}`, { machineId: run.machine_id });
      } catch (error) {
        await appendEvent(env, runId, "machine_action_failed", { action, code: error.code || "action_failed" });
      }
    })(),
  );
  return json({ accepted: true, action, run: runPublic(run) }, 202, request, env);
}

async function overview(request, env) {
  const auth = requireAuth(request, env);
  if (auth) return auth;
  if (!env.INSTABOX_API_KEY)
    return errorResponse("instabox_key_not_configured", 503, request, env, {
      message: "The Instabox key is not configured.",
    });

  try {
    const [me, usage, templates, machines] = await Promise.all([
      instabox("/v1/me", env),
      instabox("/v1/usage", env),
      instabox("/v1/templates", env),
      instabox("/v1/machines?limit=100", env),
    ]);
    const visible = (templates.templates || []).filter((template) => !template.hidden);
    const latest = new Map();
    for (const template of visible) {
      const current = latest.get(template.id);
      if (!current || String(template.version).localeCompare(String(current.version), undefined, { numeric: true }) > 0)
        latest.set(template.id, template);
    }
    return json(
      {
        version: VERSION,
        readOnly: true,
        account: { login: me.login, name: me.name, userId: me.userId },
        usage,
        templates: [...latest.values()].map((template) => ({
          id: template.id,
          version: template.version,
          digest: template.digest,
          capabilities: template.capabilities || [],
          spec: template.defaultSpec || null,
        })),
        machines: machines.machines || [],
        nextCursor: machines.nextCursor || null,
      },
      200,
      request,
      env,
    );
  } catch {
    return errorResponse("instabox_unavailable", 502, request, env, {
      message: "The Instabox account could not be read.",
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true }, 200, request, env);

    if (url.pathname === "/health" && request.method === "GET") {
      return json(
        {
          service: "nemo-control-plane",
          version: VERSION,
          capabilities: {
            instaboxRead: Boolean(env.INSTABOX_API_KEY),
            accountData: authConfigured(env),
            persistence: Boolean(env.NEMO_DB),
            orchestration: Boolean(env.NEMO_DB && env.INSTABOX_API_KEY),
            agentRunner: agentBridgeConfigured(env),
            gatewayBridge: agentBridgeConfigured(env),
            perRunNodeBinding: agentBridgeConfigured(env),
            durableRunExecution: Boolean(env.NEMO_RUN_WORKFLOW),
            mutations: Boolean(env.NEMO_DB && env.INSTABOX_API_KEY),
          },
        },
        200,
        request,
        env,
      );
    }

    const auth = requireAuth(request, env);
    if (auth && url.pathname.startsWith("/api/")) return auth;

    if (url.pathname === "/api/overview" && request.method === "GET") return overview(request, env);
    if (url.pathname === "/api/nodes/provision" && request.method === "POST") return provisionNode(request, env);
    if (url.pathname === "/api/runs" && request.method === "GET") return listRuns(request, env);
    if (url.pathname === "/api/runs" && request.method === "POST") return createRun(request, env, ctx);

    const runMatch = /^\/api\/runs\/([^/]+)(?:\/(logs|actions))?$/.exec(url.pathname);
    if (runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      if (!runMatch[2] && request.method === "GET") return getRun(request, env, runId);
      if (runMatch[2] === "logs" && request.method === "GET") return getLogs(request, env, runId);
      if (runMatch[2] === "actions" && request.method === "POST") return machineAction(request, env, ctx, runId);
    }

    return errorResponse("not_found", 404, request, env, { message: "The requested Nemo route does not exist." });
  },
};
