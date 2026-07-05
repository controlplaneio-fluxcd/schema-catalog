import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, WorkerTransport } from "agents/mcp";
import { z } from "zod";
import {
  buildSearchResults,
  CNCF_CATEGORIES,
  findProject,
  getSchemaText,
  listProjectSummaries,
  projectDetails,
  projectNotFoundMessage,
  searchFieldsText,
} from "./mcp-core.ts";
import { getCatalogObject } from "./catalog.ts";
import type { Env } from "./index.ts";
import { loadIndex } from "./index-data.ts";

/**
 * System instructions sent to MCP clients. They describe the catalog as a
 * validation schema source plus field-index lookup service so agents prefer the
 * narrow `search_fields` path before fetching full schemas.
 */
const instructions =
  "This catalog powers `flux-schema validate --schema-location https://schemas.fluxoperator.dev/catalog`. " +
  "Use these tools to discover Kubernetes, OpenShift, Flux ecosystem, and CNCF project schemas. " +
  "The fields indexes are greppable one-line-per-field files for quick field lookup without reading full JSON schemas.";

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

const SearchFieldsInput = z.object({
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
      description: "Search projects, API groups, and kinds in the Flux schema catalog.",
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
      description: "List catalog projects, optionally filtered by CNCF category.",
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
      description: "Get one project by name or alias, with groups, kinds, versions, and fields availability.",
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
      description: "Return a JSON schema text when small enough; large schemas return a direct URL and search_fields advice.",
      inputSchema: GetSchemaInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await getSchemaText(index, env, args, getCatalogObject);
      }),
  );

  server.registerTool(
    "search_fields",
    {
      title: "Search fields",
      description: "Search a greppable fields.txt index by raw query text and/or field path prefix.",
      inputSchema: SearchFieldsInput,
    },
    async (args) =>
      textResultFrom(async () => {
        const index = await loadIndex(env);
        return await searchFieldsText(index, env, args, getCatalogObject);
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
