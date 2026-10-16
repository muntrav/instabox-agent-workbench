import { readFile } from "node:fs/promises";

const contract = JSON.parse(await readFile(new URL("../control-plane/openapi.json", import.meta.url), "utf8"));

const requiredPaths = [
  "/health",
  "/api/overview",
  "/api/runs",
  "/api/runs/{runId}",
  "/api/runs/{runId}/logs",
  "/api/runs/{runId}/actions",
];
const requiredOperations = [
  "getHealth",
  "getOverview",
  "listRuns",
  "createRun",
  "getRun",
  "getRunLogs",
  "runMachineAction",
];

if (contract.openapi !== "3.1.0") throw new Error("Expected an OpenAPI 3.1 contract.");
if (contract.info?.version !== "2.0.0") throw new Error("Expected control-plane contract version 2.0.0.");

for (const path of requiredPaths) {
  if (!contract.paths?.[path]) throw new Error(`Missing path ${path}.`);
}

for (const operationId of requiredOperations) {
  const operation = Object.values(contract.paths)
    .flatMap((path) => Object.values(path))
    .find((candidate) => candidate?.operationId === operationId);
  if (!operation) throw new Error(`Missing operation ${operationId}.`);
}

const overview = contract.paths["/api/overview"].get;
if (!overview.security?.some((scheme) => scheme.NemoBearer)) throw new Error("Overview must require NemoBearer.");
for (const status of ["401", "502"]) {
  if (!overview.responses?.[status]) throw new Error(`Overview is missing ${status} error response.`);
}

for (const [path, methods] of Object.entries(contract.paths)) {
  if (!path.startsWith("/api/")) continue;
  for (const [method, operation] of Object.entries(methods)) {
    if (method !== "get" && !operation.security?.some((scheme) => scheme.NemoBearer)) {
      throw new Error(`${method.toUpperCase()} ${path} must require NemoBearer.`);
    }
  }
}

console.log("Nemo control-plane contract is valid for phases 1-3.");
