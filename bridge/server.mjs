import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";

const HOST = process.env.NEMO_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.NEMO_BRIDGE_PORT || 18790);
const ACCESS_CLIENT_ID = process.env.NEMO_BRIDGE_ACCESS_CLIENT_ID;
const AGENT_ID = process.env.NEMO_OPENCLAW_AGENT_ID || "nemo";
const AGENT_TIMEOUT_SECONDS = Math.min(Math.max(Number(process.env.NEMO_AGENT_TIMEOUT_SECONDS || 900), 30), 1800);
const MAX_BODY_BYTES = 128 * 1024;
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const GATEWAY_CONFIG = process.env.OPENCLAW_CONFIG_PATH || "/opt/openclaw/config/openclaw.json";

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function redact(value) {
  return String(value || "")
    .replace(/(?:sk-|ibk_|oc-sent-v2\.)[A-Za-z0-9._:-]+/g, "<redacted>")
    .replace(/(authorization|token|secret|password|cookie|credential)[=:][^\s,}]+/gi, "$1=<redacted>");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("request too large"), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validRunId(value) {
  return typeof value === "string" && /^run_[A-Za-z0-9_-]{8,80}$/.test(value);
}

function validateRequest(body) {
  if (!body || typeof body !== "object") throw Object.assign(new Error("JSON object required"), { status: 400 });
  if (!validRunId(body.runId)) throw Object.assign(new Error("runId is invalid"), { status: 400 });
  if (typeof body.nodeName !== "string" || body.nodeName.length < 1 || body.nodeName.length > 160)
    throw Object.assign(new Error("nodeName is required"), { status: 400 });
  if (typeof body.workspace !== "string" || !body.workspace.startsWith("/data/") || body.workspace.length > 240)
    throw Object.assign(new Error("workspace must be an Instabox /data path"), { status: 400 });
  if (typeof body.task !== "string" || body.task.trim().length < 1 || body.task.length > 12000)
    throw Object.assign(new Error("task is required"), { status: 400 });
  if (
    typeof body.repositoryUrl !== "string" ||
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(body.repositoryUrl)
  )
    throw Object.assign(new Error("repositoryUrl must be a GitHub HTTPS URL"), { status: 400 });
  return {
    runId: body.runId,
    nodeName: body.nodeName,
    workspace: body.workspace,
    task: body.task.trim(),
    repositoryUrl: body.repositoryUrl,
    ref: typeof body.ref === "string" ? body.ref.slice(0, 160) : "",
  };
}

function promptFor(input) {
  return [
    "You are Nemo's isolated Instabox coding agent.",
    `Run ID: ${input.runId}`,
    `Target node: ${input.nodeName}`,
    `Remote workspace: ${input.workspace}`,
    `Repository: ${input.repositoryUrl}`,
    `Ref: ${input.ref || "the checked-out ref"}`,
    "",
    "Hard execution boundary:",
    `- Use node_exec only, and explicitly target the node named ${JSON.stringify(input.nodeName)} on every command.`,
    "- Never use gateway_exec, exec, filesystem tools, browser tools, messaging, or any local/VPS workspace.",
    "- Every command must run on the Instabox node in the remote workspace above.",
    "- Do not create, modify, or delete files outside that remote workspace.",
    "- Do not expose credentials, environment variables, or tokens in your response.",
    "",
    "The repository has already been checked out in the remote workspace. Inspect it, implement the task, run the most relevant tests, and return a concise result with changed files, tests, and blockers.",
    `Task: ${input.task}`,
  ].join("\n");
}

function runAgent(prompt) {
  return new Promise((resolve) => {
    const child = spawn(
      OPENCLAW_BIN,
      ["agent", "--agent", AGENT_ID, "--message-file", "-", "--json", "--timeout", String(AGENT_TIMEOUT_SECONDS)],
      {
        cwd: process.env.NEMO_BRIDGE_WORKDIR || "/opt/openclaw/state/agents/nemo/workspace",
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ ok: false, error: redact(error.message) }));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: redact(stderr || stdout || `agent exited with ${code}`) });
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        const text = result?.result?.payloads?.find((item) => typeof item?.text === "string")?.text || "";
        resolve({ ok: true, text, model: result?.result?.meta?.agentMeta?.model || null });
      } catch {
        resolve({ ok: false, error: "OpenClaw returned an unreadable agent result." });
      }
    });
    child.stdin.end(prompt);
  });
}

function runCli(args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn(OPENCLAW_BIN, args, {
      cwd: process.env.NEMO_BRIDGE_WORKDIR || "/opt/openclaw/state/agents/nemo/workspace",
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, error: redact(error.message) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr: redact(stderr) });
    });
  });
}

async function nodeJoin(res) {
  let token = "";
  try {
    const config = JSON.parse(await readFile(GATEWAY_CONFIG, "utf8"));
    token = typeof config?.gateway?.auth?.token === "string" ? config.gateway.auth.token : "";
  } catch {
    return json(res, 503, { error: "gateway_auth_unavailable" });
  }
  if (!token) return json(res, 503, { error: "gateway_auth_unavailable" });
  const result = await runCli(["devices", "join-code", "--json", "--token", token]);
  if (!result.ok) return json(res, 502, { error: "join_code_failed" });
  try {
    const body = JSON.parse(result.stdout.trim());
    if (typeof body.joinUrl !== "string")
      return json(res, 502, { error: "join_code_invalid" });
    const joinUrl = new URL(body.joinUrl);
    if (joinUrl.pathname === "/" || !joinUrl.pathname.startsWith("/j/"))
      return json(res, 502, { error: "join_code_invalid" });
    joinUrl.protocol = "https:";
    joinUrl.host = "nemo-gateway.nywezalabs.com";
    joinUrl.search = "";
    return json(res, 200, { joinUrl: joinUrl.toString(), nodeName: "Nemo Instabox" });
  } catch {
    return json(res, 502, { error: "join_code_invalid" });
  }
}

async function nodeApprove(req, res) {
  const body = JSON.parse(await readBody(req));
  const name = typeof body?.nodeName === "string" ? body.nodeName : "Nemo Instabox";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pending = await runCli(["nodes", "pending", "--json"]);
    if (pending.ok) {
      try {
        const rows = JSON.parse(pending.stdout.trim());
        const candidates = Array.isArray(rows) ? rows : rows.pending || [];
        const match = candidates.find((row) => {
          const label = row.displayName || row.name || row.nodeName || row.device?.displayName || "";
          return label === name || !name;
        });
        if (match?.requestId) {
          const approved = await runCli(["nodes", "approve", match.requestId]);
          if (approved.ok) return json(res, 200, { approved: true, nodeName: name });
        }
      } catch {
        // Continue polling while the node host completes its first handshake.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return json(res, 504, { error: "node_pairing_timeout", nodeName: name });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      service: "nemo-gateway-bridge",
      agent: AGENT_ID,
      accessConfigured: Boolean(ACCESS_CLIENT_ID),
    });
  }
  if (req.method === "POST" && req.url === "/v1/node/join") {
    if (!ACCESS_CLIENT_ID || req.headers["cf-access-client-id"] !== ACCESS_CLIENT_ID)
      return json(res, 401, { error: "access_required" });
    return nodeJoin(res);
  }
  if (req.method === "POST" && req.url === "/v1/node/approve") {
    if (!ACCESS_CLIENT_ID || req.headers["cf-access-client-id"] !== ACCESS_CLIENT_ID)
      return json(res, 401, { error: "access_required" });
    try {
      return await nodeApprove(req, res);
    } catch (error) {
      return json(res, 400, { error: "invalid_request", message: error.message });
    }
  }
  if (req.method !== "POST" || req.url !== "/v1/agent/turn") return json(res, 404, { error: "not_found" });
  if (!ACCESS_CLIENT_ID || req.headers["cf-access-client-id"] !== ACCESS_CLIENT_ID)
    return json(res, 401, { error: "access_required" });
  try {
    const input = validateRequest(JSON.parse(await readBody(req)));
    const result = await runAgent(promptFor(input));
    return json(
      res,
      result.ok ? 200 : 502,
      result.ok
        ? { runId: input.runId, result: result.text, model: result.model }
        : { error: "agent_failed", detail: result.error },
    );
  } catch (error) {
    return json(res, error.status || 400, {
      error: error.status === 413 ? "request_too_large" : "invalid_request",
      message: error.message,
    });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`nemo-gateway-bridge listening on ${HOST}:${PORT}\n`);
});
