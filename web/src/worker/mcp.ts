// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Stateless MCP endpoint for the modern 2026-07-28 protocol, including the
 * per-request `_meta` envelope, `Mcp-Method`/`Mcp-Name` headers, and
 * `server/discover`. The SDK also provides built-in compatibility for
 * 2025-era stateless clients. Legacy responses are SSE-framed because the
 * fallback has no JSON mode, legacy GET returns 405, and an unknown tool is a
 * -32602 protocol error.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { SERVER_INFO } from "./server-card.ts";
import {
  findProject,
  getSchemaText,
  grepCatalogText,
  grepSchemaText,
  listProjectsText,
  projectText,
  projectNotFoundMessage,
} from "./mcp-core.ts";
import { getCatalogObject } from "./catalog.ts";
import type { Env } from "./index.ts";
import { loadIndex } from "./index-data.ts";

// Catalog content changes only at deploy and is public, so 2026-era clients
// can cache list results and the discover probe for one hour in shared caches.
const CACHE_HINT = { ttlMs: 3_600_000, cacheScope: "public" } as const;

/**
 * System instructions sent to MCP clients. They position the catalog as the
 * authoritative source for Kubernetes-ecosystem API definitions, tell agents
 * exactly when to reach for it (any manifest work), and prescribe the cheap
 * `grep_catalog` -> `grep_schema` -> `get_schema` escalation path.
 */
const instructions =
  "An LLM-friendly `kubectl explain` for the whole Kubernetes ecosystem, no cluster required: authoritative " +
  "JSON Schemas and field indexes for core Kubernetes, OpenShift, the Flux ecosystem, and a broad set of CNCF " +
  "projects, controllers, and operators. " +
  "Use these tools whenever you generate, edit, review, or validate a Kubernetes manifest or custom resource: " +
  "look up the real kinds, field names, types, constraints, required values, and apiVersions here instead of " +
  "reconstructing them from training data. " +
  "Flow: discover with `grep_catalog`, answer field questions with `grep_schema`, and call `get_schema` " +
  "only when you need the complete JSON Schema.";

const GrepCatalogInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(500).default(20),
});

const ListProjectsInput = z.object({});

const GetProjectInput = z.object({
  project: z.string().min(1),
});

const GetSchemaInput = z.object({
  apiVersion: z.string().min(1),
  kind: z.string().min(1),
});

const GrepSchemaInput = z.object({
  apiVersion: z.string().min(1),
  kind: z.string().min(1),
  query: z.string().optional(),
  prefix: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

let handler: ReturnType<typeof createMcpHandler> | undefined;

// Read by the server factory on every request instead of closing over the
// first request's env, so a surviving isolate picks up binding changes.
let currentEnv: Env;

/**
 * Handles modern 2026-07-28 stateless requests and the SDK's built-in legacy
 * compatibility lane at `/mcp`. Every request gets a fresh server instance.
 */
export function handleMcp(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  currentEnv = env;
  handler ??= createMcpHandler(() => createCatalogMcpServer(currentEnv), {
    // The route is an EXACT pathname match, and src/worker/index.ts dispatches
    // only the exact `/mcp` path.
    route: "/mcp",
    // The v2 wrapper validates browser Origin headers against a
    // localhost/workers.dev allowlist by default, which would lock hosted MCP
    // clients out of the custom domain. The content is public, read-only, and
    // unauthenticated with no session to steal, so origins are unrestricted.
    allowedOriginHostnames: "*",
  });
  return handler(req, env, ctx);
}

function createCatalogMcpServer(env: Env): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions,
    cacheHints: {
      "server/discover": CACHE_HINT,
      "tools/list": CACHE_HINT,
    },
  });

  server.registerTool(
    "grep_catalog",
    {
      title: "Grep catalog",
      description:
        "Grep the catalog of kinds with JavaScript RegExp syntax; returns one line per apiVersion: `<apiVersion> <Kind> (aliases)  # project`, where aliases are kubectl short names and irregular resource names. Start here to resolve what a manifest needs.",
      inputSchema: GrepCatalogInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return grepCatalogText(index, args.query, args.limit);
      }),
  );

  server.registerTool(
    "grep_schema",
    {
      title: "Grep schema",
      description:
        "Grep an apiVersion/kind flattened field index with JavaScript RegExp syntax; matches are case-insensitive and evaluated per field line. Constraints are part of each line, so a query like `\\(required\\)` lists every required field. Prefer it over get_schema for targeted field lookup.",
      inputSchema: GrepSchemaInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await grepSchemaText(index, env, args, getCatalogObject);
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Enumerate every project in catalog order as plain-text lines with project name, version, GitHub repo, and kind count. Grouped projects report their source count in place of a version.",
      inputSchema: ListProjectsInput,
    },
    async () =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return listProjectsText(index);
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Fetch one project's TypeMeta lines by name, alias, or member source name (e.g. ack-s3 resolves to the AWS Controllers for Kubernetes project), including every apiVersion/Kind pair and field-index coverage.",
      inputSchema: GetProjectInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        const project = findProject(index, args.project);
        return project === undefined
          ? projectNotFoundMessage(index, args.project)
          : projectText(project);
      }),
  );

  server.registerTool(
    "get_schema",
    {
      title: "Get schema",
      description:
        "Fetch the complete JSON Schema for an apiVersion and kind when you need every field; oversized schemas return a direct URL and a pointer to grep_schema.",
      inputSchema: GetSchemaInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await getSchemaText(index, env, args, getCatalogObject);
      }),
  );

  return server;
}

function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}

async function textResultFrom(fn: () => Promise<string>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    return textResult(await fn());
  } catch (error) {
    return textResult(error instanceof Error ? `Tool error: ${error.message}` : `Tool error: ${String(error)}`);
  }
}
