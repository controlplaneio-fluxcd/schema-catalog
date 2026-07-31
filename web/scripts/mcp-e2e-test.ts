// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Runs read-only end-to-end checks against the deployed MCP server, including
 * the modern and legacy protocol lanes, error semantics, and discovery
 * documents. Run it after deployment against production, or pass the base URL
 * of a local Wrangler dev session.
 *
 * Usage (from web/):
 *   bun scripts/mcp-e2e-test.ts [base-url]
 */

const DEFAULT_BASE_URL = "https://schemas.fluxoperator.dev";
const baseUrl = (Bun.argv[2] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
const endpoint = `${baseUrl}/mcp`;
const accept = "application/json, text/event-stream";
const protocolVersion = "2026-07-28";
const clientInfo = { name: "mcp-e2e-test", version: "1.0" };
const meta = {
  "io.modelcontextprotocol/protocolVersion": protocolVersion,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": clientInfo,
};

let passed = 0;
let checks = 0;
let requestId = 0;

function ok(cond: unknown, label: string, detail: string): void {
  checks++;
  if (cond) passed++;
  console.log(`${cond ? "pass" : "FAIL"} ${label}: ${detail.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}`);
}

function show(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

/** Fetch with a hard timeout so a stalled endpoint cannot hang the script. */
function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
}

async function parseRpc(res: Response, id?: number): Promise<any> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) return res.json();
  const frames = (await res.text()).split(/\r?\n\r?\n/);
  const messages = frames.flatMap((frame) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    return data ? [JSON.parse(data)] : [];
  });
  // Prefer the message answering this request id; notifications carry none.
  return messages.find((message) => id !== undefined && message?.id === id) ?? messages.at(-1);
}

async function modernRpc(
  method: string,
  params: Record<string, unknown> = {},
  tool?: string,
): Promise<{ res: Response; body: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept,
    "mcp-protocol-version": protocolVersion,
    "mcp-method": method,
  };
  if (tool !== undefined) headers["mcp-name"] = tool;

  const id = ++requestId;
  const res = await timedFetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: { ...params, _meta: meta },
    }),
  });
  return { res, body: await parseRpc(res, id) };
}

async function legacyRpc(method: string, params: Record<string, unknown> = {}): Promise<{ res: Response; body: any }> {
  const id = ++requestId;
  const res = await timedFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  return { res, body: await parseRpc(res, id) };
}

function resultText(body: any): string {
  return (
    body?.result?.content
      ?.filter((item: any) => item.type === "text")
      .map((item: any) => item.text)
      .join("\n") ?? ""
  );
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

console.log(`MCP end-to-end checks: ${baseUrl}`);

console.log("\nmodern protocol (2026-07-28)");

const discover = await modernRpc("server/discover");
const discoverContentType = discover.res.headers.get("content-type") ?? "";
ok(
  discoverContentType.includes("application/json") && !discoverContentType.includes("text/event-stream"),
  "server/discover uses JSON",
  discoverContentType,
);
ok(
  discover.body?.result?.supportedVersions?.includes(protocolVersion),
  "server/discover advertises modern protocol",
  show(discover.body?.result?.supportedVersions),
);
ok(
  discover.body?.result?.capabilities?.tools !== undefined,
  "server/discover advertises tools",
  show(discover.body?.result?.capabilities),
);
ok(
  discover.body?.result?.instructions?.includes("kubectl explain"),
  "server/discover includes instructions",
  show(discover.body?.result?.instructions),
);
ok(
  discover.body?.result?._meta?.["io.modelcontextprotocol/serverInfo"]?.name === "flux-schema-catalog",
  "server/discover identifies the server",
  show(discover.body?.result?._meta?.["io.modelcontextprotocol/serverInfo"]),
);
ok(
  discover.body?.result?.ttlMs === 3_600_000 && discover.body?.result?.cacheScope === "public",
  "server/discover includes cache hints",
  `ttlMs=${show(discover.body?.result?.ttlMs)}, cacheScope=${show(discover.body?.result?.cacheScope)}`,
);

const toolsList = await modernRpc("tools/list");
const expectedTools = ["get_project", "get_schema", "grep_catalog", "grep_schema", "list_projects"];
const actualTools = (toolsList.body?.result?.tools ?? []).map((tool: any) => tool.name).sort();
ok(
  actualTools.length === expectedTools.length && actualTools.every((name: string, index: number) => name === expectedTools[index]),
  "tools/list returns the exact tool set",
  show(actualTools),
);
ok(
  toolsList.body?.result?.ttlMs === 3_600_000 && toolsList.body?.result?.cacheScope === "public",
  "tools/list includes cache hints",
  `ttlMs=${show(toolsList.body?.result?.ttlMs)}, cacheScope=${show(toolsList.body?.result?.cacheScope)}`,
);

const grepCatalog = await modernRpc(
  "tools/call",
  { name: "grep_catalog", arguments: { query: "Kustomization" } },
  "grep_catalog",
);
const grepCatalogText = resultText(grepCatalog.body);
ok(
  grepCatalogText.includes("kustomize.toolkit.fluxcd.io/v1 Kustomization") &&
    grepCatalogText.includes("# matched "),
  "grep_catalog returns matches and footer",
  show(grepCatalogText),
);

const grepSchema = await modernRpc(
  "tools/call",
  {
    name: "grep_schema",
    arguments: {
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      query: "spec.prune",
    },
  },
  "grep_schema",
);
const grepSchemaText = resultText(grepSchema.body);
ok(
  grepSchemaText.startsWith("# kustomize.toolkit.fluxcd.io/v1 Kustomization from ") &&
    grepSchemaText.includes("spec.prune"),
  "grep_schema returns the requested field",
  show(grepSchemaText),
);

const listProjects = await modernRpc(
  "tools/call",
  { name: "list_projects", arguments: {} },
  "list_projects",
);
const listProjectsFooter = resultText(listProjects.body).split("\n").at(-1) ?? "";
ok(/^# \d+ projects$/.test(listProjectsFooter), "list_projects returns a project count", listProjectsFooter);

const getSchema = await modernRpc(
  "tools/call",
  {
    name: "get_schema",
    arguments: { apiVersion: "kustomize.toolkit.fluxcd.io/v1", kind: "Kustomization" },
  },
  "get_schema",
);
const getSchemaText = resultText(getSchema.body);
const parsedSchema = tryParseJson(getSchemaText);
const schemaIsObject =
  typeof parsedSchema === "object" && parsedSchema !== null && "properties" in parsedSchema;
const schemaHitSizeGuard = getSchemaText.includes("inline response limit");
const getSchemaLabel = schemaIsObject
  ? "get_schema returns a JSON Schema object"
  : schemaHitSizeGuard
    ? "get_schema reports the inline response limit"
    : "get_schema returns a JSON Schema or the inline response limit";
ok(
  schemaIsObject || schemaHitSizeGuard,
  getSchemaLabel,
  schemaIsObject ? "schema object with properties" : show(getSchemaText),
);

const missingMethodRes = await timedFetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept,
    "mcp-protocol-version": protocolVersion,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: ++requestId,
    method: "tools/list",
    params: { _meta: meta },
  }),
});
const missingMethodBody = await parseRpc(missingMethodRes, requestId);
ok(
  missingMethodBody?.error !== undefined &&
    (missingMethodBody.error.code === -32020 ||
      String(missingMethodBody.error.message ?? "").includes("Mcp-Method")),
  "modern request without mcp-method is rejected",
  show(missingMethodBody),
);

console.log("\nlegacy lane");

const legacyTools = await legacyRpc("tools/list");
const legacyContentType = legacyTools.res.headers.get("content-type") ?? "";
ok(
  legacyContentType.includes("text/event-stream") && legacyTools.body?.result?.tools?.length === 5,
  "tools/list works without initialize",
  `content-type=${legacyContentType}, tools=${show(legacyTools.body?.result?.tools?.length)}`,
);

const initialize = await legacyRpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo,
});
ok(
  initialize.res.status === 200 &&
    typeof initialize.body?.result?.protocolVersion === "string" &&
    initialize.body.result.protocolVersion.length > 0,
  "initialize negotiates a protocol",
  `status=${initialize.res.status}, protocolVersion=${show(initialize.body?.result?.protocolVersion)}`,
);

console.log("\nerror semantics");

const getResponse = await timedFetch(endpoint, { headers: { accept: "application/json" } });
ok(getResponse.status === 405, "GET is method not allowed", `status=${getResponse.status}`);

const unknownMethod = await legacyRpc("no/such");
ok(
  unknownMethod.body?.error?.code === -32601,
  "unknown method returns -32601",
  show(unknownMethod.body),
);

const unknownTool = await legacyRpc("tools/call", { name: "no_such_tool", arguments: {} });
ok(unknownTool.body?.error?.code === -32602, "unknown tool returns -32602", show(unknownTool.body));

const invalidArguments = await legacyRpc("tools/call", { name: "grep_catalog", arguments: {} });
ok(
  invalidArguments.body?.result?.isError === true,
  "invalid arguments return a tool-result error",
  show(invalidArguments.body),
);

console.log("\ndiscovery");

const serverCardRes = await timedFetch(`${baseUrl}/mcp/server-card`);
const serverCard: any = await serverCardRes.json();
ok(
  serverCard?.remotes?.[0]?.supportedProtocolVersions?.[0] === protocolVersion,
  "server card advertises modern protocol first",
  show(serverCard?.remotes?.[0]?.supportedProtocolVersions),
);
ok(
  serverCard?.serverInfo?.name === "flux-schema-catalog" &&
    typeof serverCard?.serverInfo?.version === "string" &&
    serverCard?.serverInfo?.version === serverCard?.version,
  "server card identity and version agree",
  `serverInfo=${show(serverCard?.serverInfo)}, version=${show(serverCard?.version)}`,
);

const wellKnownCardRes = await timedFetch(`${baseUrl}/.well-known/mcp/server-card.json`);
const wellKnownCard: any = await wellKnownCardRes.json();
ok(
  wellKnownCard?.remotes?.[0]?.supportedProtocolVersions?.[0] === protocolVersion,
  "well-known server card advertises modern protocol first",
  show(wellKnownCard?.remotes?.[0]?.supportedProtocolVersions),
);

const catalogRes = await timedFetch(`${baseUrl}/.well-known/mcp/catalog.json`);
const catalog: any = await catalogRes.json();
ok(
  Array.isArray(catalog?.entries) && catalog.entries.length > 0,
  "MCP catalog contains entries",
  show(catalog?.entries),
);

console.log(`\n${passed}/${checks} checks passed`);
if (passed !== checks) process.exit(1);
