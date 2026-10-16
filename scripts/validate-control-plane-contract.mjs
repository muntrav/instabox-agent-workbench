import { readFile } from "node:fs/promises";

const contract = JSON.parse(await readFile(new URL("../control-plane/openapi.json", import.meta.url), "utf8"));

const requiredPaths = ["/health", "/api/overview"];
const requiredOperations = ["getHealth", "getOverview"];

if (contract.openapi !== "3.1.0") throw new Error("Expected an OpenAPI 3.1 contract.");
if (contract.info?.version !== "1.0.0") throw new Error("Expected control-plane contract version 1.0.0.");

for (const path of requiredPaths) {
  if (!contract.paths?.[path]?.get) throw new Error(`Missing GET ${path}.`);
}

for (const operationId of requiredOperations) {
  const operation = Object.values(contract.paths)
    .map((path) => path.get)
    .find((get) => get?.operationId === operationId);
  if (!operation) throw new Error(`Missing operation ${operationId}.`);
}

const overview = contract.paths["/api/overview"].get;
if (!overview.security?.some((scheme) => scheme.NemoBearer)) throw new Error("Overview must require NemoBearer.");
for (const status of ["401", "502"]) {
  if (!overview.responses?.[status]) throw new Error(`Overview is missing ${status} error response.`);
}

if (Object.keys(contract.paths).some((path) => path !== "/health" && path !== "/api/overview")) {
  throw new Error("Phase 1 contract must remain read-only.");
}

console.log("Nemo control-plane contract is valid.");
