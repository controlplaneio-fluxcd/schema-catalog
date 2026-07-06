// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, WorkerTransport } from "agents/mcp";
import { z } from "zod";
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
    "grep_catalog",
    {
      title: "Grep catalog",
      description:
        "Grep the catalog of kinds with JavaScript RegExp syntax; returns one line per apiVersion: `<apiVersion> <Kind>  # project`. Start here to resolve what a manifest needs.",
      inputSchema: GrepCatalogInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return grepCatalogText(index, args.query, args.limit);
      }),
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Enumerate every project in catalog order as plain-text lines with project name, version, GitHub repo, and kind count.",
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
        "Fetch one project's TypeMeta lines by name or alias, including every apiVersion/Kind pair and field-index coverage.",
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
