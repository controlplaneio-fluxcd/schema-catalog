// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, WorkerTransport } from "agents/mcp";
import { z } from "zod";
import {
  buildSearchResults,
  CNCF_CATEGORIES,
  findProject,
  getSchemaText,
  grepSchemaText,
  listProjectSummaries,
  projectDetails,
  projectNotFoundMessage,
} from "./mcp-core.ts";
import { getCatalogObject } from "./catalog.ts";
import type { Env } from "./index.ts";
import { loadIndex } from "./index-data.ts";

/**
 * System instructions sent to MCP clients. They position the catalog as the
 * authoritative source for Kubernetes-ecosystem API definitions, tell agents
 * exactly when to reach for it (any manifest work), and prescribe the cheap
 * discover -> `grep_schema` -> `get_schema` escalation path.
 */
const instructions =
  "An LLM-friendly `kubectl explain` for the whole Kubernetes ecosystem, no cluster required: authoritative " +
  "JSON Schemas and field indexes for core Kubernetes, OpenShift, the Flux ecosystem, and a broad set of CNCF " +
  "projects, controllers, and operators. " +
  "Use these tools whenever you generate, edit, review, or validate a Kubernetes manifest or custom resource: " +
  "look up the real kinds, field names, types, constraints, required values, and apiVersions here instead of " +
  "reconstructing them from training data. " +
  "Flow: discover with `search_catalog` (or `list_projects`/`get_project`) to pin down the API group, kind, and " +
  "available versions; answer most field questions with `grep_schema`, which runs case-insensitive JavaScript regex over " +
  "compact flattened field lines (path, type, constraints, description); call `get_schema` " +
  "only when you need the complete JSON Schema. Schemas are versioned per apiVersion — request the exact " +
  "version the manifest targets.";

const SearchCatalogInput = z.object({
  query: z.string().min(2),
  limit: z.number().int().min(1).max(100).default(20),
});

const ListProjectsInput = z.object({
  category: z.enum(CNCF_CATEGORIES).optional(),
});

const GetProjectInput = z.object({
  project: z.string().min(1),
});

const GetSchemaInput = z.object({
  group: z.string().min(1),
  kind: z.string().min(1),
  version: z.string().min(1).optional(),
});

const GrepSchemaInput = z.object({
  group: z.string().min(1),
  kind: z.string().min(1),
  version: z.string().min(1).optional(),
  query: z.string().optional(),
  prefix: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

/**
 * Handles the stateless streamable HTTP MCP endpoint at `/mcp`. The transport
 * uses no session IDs, so every request builds a server instance whose tools
 * load the current memoized index and catalog objects through Worker bindings.
 */
export function handleMcp(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const server = createCatalogMcpServer(env);
  const transport = new WorkerTransport({ sessionIdGenerator: undefined });
  const handler = createMcpHandler(server, { route: "/mcp", transport });
  return handler(req, env, ctx);
}

function createCatalogMcpServer(env: Env): McpServer {
  const server = new McpServer(
    { name: "flux-schema-catalog", version: "0.1.0" },
    {
      instructions,
    },
  );

  server.registerTool(
    "search_catalog",
    {
      title: "Search catalog",
      description: "Resolve a keyword (project, API group, or kind) to matching groups, kinds, and versions. Start here when you don't yet know the exact group/kind a manifest needs.",
      inputSchema: SearchCatalogInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return JSON.stringify(buildSearchResults(index, args.query, args.limit), null, 2);
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Enumerate every project in the catalog — Kubernetes, OpenShift, Flux, and CNCF controllers and operators — optionally filtered by CNCF category. Use it to check coverage or browse by area.",
      inputSchema: ListProjectsInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return JSON.stringify(listProjectSummaries(index, args.category), null, 2);
      }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Fetch one project's full API surface by name or alias: its groups, kinds, apiVersions, and which versions have a field index.",
      inputSchema: GetProjectInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        const project = findProject(index, args.project);
        return project === undefined
          ? projectNotFoundMessage(index, args.project)
          : JSON.stringify(projectDetails(index, project), null, 2);
      }),
  );

  server.registerTool(
    "get_schema",
    {
      title: "Get schema",
      description: "Fetch the complete JSON Schema for a group/kind/version when you need every field to author or strictly validate a resource; oversized schemas return a direct URL and a pointer to grep_schema.",
      inputSchema: GetSchemaInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await getSchemaText(index, env, args, getCatalogObject);
      }),
  );

  server.registerTool(
    "grep_schema",
    {
      title: "Grep schema",
      description: "Grep a kind's flattened field index with JavaScript RegExp syntax; matches are case-insensitive and evaluated per line (path, type, constraints, description). A greppable `kubectl explain --recursive` — prefer it for targeted field lookup.",
      inputSchema: GrepSchemaInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await grepSchemaText(index, env, args, getCatalogObject);
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
