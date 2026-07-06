// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex } from "../../shared/types.ts";
import {
  createBreadcrumb,
  createCodeBlock,
  createCopyButton,
  createPage,
  kindCount,
  schemaCount,
  text,
} from "../dom.ts";
import { homeRoute } from "../router.ts";

/** Public streamable-HTTP MCP endpoint advertised to agents. */
const MCP_ENDPOINT = "https://schemas.fluxoperator.dev/mcp";

const CLAUDE_COMMAND = `claude mcp add --transport http flux-schema-catalog ${MCP_ENDPOINT}`;

const CODEX_COMMAND = `codex mcp add flux-schema-catalog --url ${MCP_ENDPOINT}`;

const CLIENT_CONFIG = `{
  "mcpServers": {
    "flux-schema-catalog": {
      "type": "http",
      "url": "${MCP_ENDPOINT}"
    }
  }
}`;

const FEATURES: Array<{ title: string; body: string }> = [
  {
    title: "Extracted from upstream",
    body:
      "Every kind, field, type, and constraint is extracted from the project's published API definitions. The agent looks it up instead of reconstructing it from training data.",
  },
  {
    title: "Write valid manifests",
    body:
      "A HelmRelease, a Gateway, a Cilium policy: the agent pulls the schema for the exact apiVersion it targets and only uses fields that exist.",
  },
  {
    title: "Review manifests",
    body:
      "Point the agent at existing manifests and it verifies field paths, required values, and deprecations against the real schema, before the cluster rejects them.",
  },
  {
    title: "Rebuilt daily",
    body:
      "The catalog tracks upstream releases, so new CRDs, kinds, and apiVersions land within a day of shipping, nothing for you to update.",
  },
];

const TOOLS: Array<{ name: string; description: string }> = [
  { name: "grep_catalog", description: "Grep TypeMeta lines with case-insensitive regex: apiVersion, Kind, and project." },
  { name: "list_projects", description: "Enumerate covered projects with version, GitHub repo, and kind count." },
  { name: "get_project", description: "Fetch one project's apiVersion/Kind lines and field-index coverage." },
  { name: "get_schema", description: "Fetch the complete JSON Schema for an apiVersion and kind." },
  { name: "grep_schema", description: "Grep an apiVersion/kind flattened field index with case-insensitive regex." },
];

/**
 * Renders the MCP server page: what the catalog gives an AI agent, how to wire
 * the endpoint into any MCP client, and the tools it exposes. Counts are read
 * from the generated index so the pitch stays concrete.
 */
export function renderMcp(index: CatalogIndex): HTMLElement {
  const page = createPage("mcp-page");
  page.append(
    createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "AI agents" }]),
    createHero(index),
    createWhySection(),
    createConfigSection(),
    createToolsSection(),
  );
  return page;
}

function createHero(index: CatalogIndex): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero mcp-hero";

  const projects = index.projects.length;
  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);
  const schemas = index.projects.reduce((total, project) => total + schemaCount(project), 0);

  hero.append(
    text("h1", "", "Flux Schema MCP Server"),
    text(
      "p",
      "mcp-tagline",
      "An LLM-friendly kubectl explain for the whole Kubernetes ecosystem, no cluster required. One endpoint serves the kinds, fields, types, constraints, and apiVersions for every resource your agent writes or reviews.",
    ),
    createEndpoint(),
    text(
      "p",
      "mcp-meta",
      `Free public service operated by the Flux Operator team · ${projects.toLocaleString("en-US")} projects · ${kinds.toLocaleString("en-US")} kinds · ${schemas.toLocaleString("en-US")} schemas`,
    ),
  );
  return hero;
}

function createEndpoint(): HTMLElement {
  const row = document.createElement("div");
  row.className = "mcp-endpoint";

  const url = document.createElement("code");
  url.textContent = MCP_ENDPOINT;
  row.append(url, createCopyButton(MCP_ENDPOINT, "Copy endpoint", ""));
  return row;
}

function createWhySection(): HTMLElement {
  const section = createSection("Why connect it");
  section.append(
    text(
      "p",
      "mcp-lead",
      "Language models writing Kubernetes YAML from training data invent field names, misremember apiVersions, and drop required values. This server gives the agent the real schemas instead: curated JSON Schemas and greppable field indexes for core Kubernetes, OpenShift, the Flux ecosystem, and a growing set of CNCF projects, controllers, and operators, served over MCP.",
    ),
  );

  const grid = document.createElement("div");
  grid.className = "mcp-features";
  for (const feature of FEATURES) {
    const card = document.createElement("div");
    card.className = "mcp-feature";
    card.append(text("h3", "", feature.title), text("p", "", feature.body));
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function createConfigSection(): HTMLElement {
  const section = createSection("Configure your agent");
  section.append(
    text(
      "p",
      "mcp-lead",
      "Standard streamable-HTTP MCP transport, no authentication or API key. Point any MCP client at the endpoint.",
    ),
    text("h3", "", "Claude Code"),
    createCodeBlock(CLAUDE_COMMAND),
    text("h3", "", "Codex"),
    createCodeBlock(CODEX_COMMAND),
    text("h3", "", "Other MCP clients (Cursor, VS Code, Windsurf, …)"),
    createCodeBlock(CLIENT_CONFIG, "json"),
  );
  return section;
}

function createToolsSection(): HTMLElement {
  const section = createSection("Tools");
  section.append(text("p", "mcp-lead", "Five tools, meant to be called in narrowing order: discover the group and kind, grep the flattened schema cheaply, and pull the full JSON Schema only when needed."));

  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "kind-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(text("th", "", "Tool"), text("th", "", "What it does"));
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  for (const tool of TOOLS) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.append(text("code", "mono", tool.name));
    row.append(nameCell, text("td", "muted", tool.description));
    tbody.append(row);
  }

  table.append(thead, tbody);
  scroller.append(table);
  section.append(scroller);
  return section;
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "mcp-section";
  section.append(text("h2", "", title));
  return section;
}
