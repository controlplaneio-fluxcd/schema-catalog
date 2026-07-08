// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { kindCount, schemaCount } from "../../shared/index-query.ts";
import type { CatalogIndex } from "../../shared/types.ts";
import {
  createBreadcrumb,
  createCodeBlock,
  createInlineCopy,
  createPage,
  createSection,
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
      "Every kind, field, type, and constraint comes from the project's published API definitions. The agent looks it up instead of reconstructing it from training data.",
  },
  {
    title: "Write valid manifests",
    body:
      "The agent pulls the schema for the exact API version a manifest targets. Field descriptions teach it what each field does, including new features.",
  },
  {
    title: "Review manifests",
    body:
      "Point the agent at existing manifests and it verifies field paths, required values, and deprecations against the real schema before the cluster rejects them.",
  },
  {
    title: "Rebuilt daily",
    body:
      "The catalog tracks upstream releases, so new kinds and API versions land here within a day of shipping.",
  },
];

/**
 * Measured on 2026-07-08 with Claude Opus 4.8 in headless Claude Code runs:
 * four tasks (two field lookups, one manifest to write, one manifest review
 * with planted errors) over Flux Operator and kgateway CRDs, graded against
 * the published schemas. Per-task averages, MCP vs web search: 1 vs 5 tool
 * calls (80% fewer) and 48k vs 112k tokens processed (57% fewer). Both
 * setups scored 4 of 4; training data alone scored 1 of 4.
 */
const BENCHMARK_STATS: Array<{ label: string; value: string; detail: string }> = [
  {
    label: "Fewer tokens",
    value: "57%",
    detail: "48k tokens per task, vs 112k with web search.",
  },
  {
    label: "Fewer tool calls",
    value: "80%",
    detail: "One schema lookup per task, vs five web fetches.",
  },
];

const TOOLS: Array<{ name: string; description: string }> = [
  { name: "grep_catalog", description: "Search the catalog with a regex and get back matching kinds and their API versions." },
  { name: "grep_schema", description: "Search a kind's fields with a regex and get back paths, types, constraints, and descriptions." },
  { name: "list_projects", description: "List every project in the catalog with its upstream version and kind count." },
  { name: "get_project", description: "List all the kinds and API versions that one project ships." },
  { name: "get_schema", description: "Fetch the complete JSON Schema for a kind and API version." },
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
    createBenchmarkSection(),
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
      "An LLM-friendly kubectl explain for the whole Kubernetes ecosystem, no cluster required. One endpoint serves the kinds, fields, types, and constraints for every resource your agent writes or reviews.",
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
  return createInlineCopy(MCP_ENDPOINT, "Copy endpoint", "ai");
}

function createWhySection(): HTMLElement {
  const section = createSection("What your agent gets", "features");
  section.append(
    text(
      "p",
      "mcp-lead",
      "Models writing Kubernetes YAML from memory invent field names and miss required values. This MCP server lets your agent look up the real schema instead.",
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

function createBenchmarkSection(): HTMLElement {
  const section = createSection("Measured impact", "benchmark");
  section.append(
    text(
      "p",
      "mcp-lead",
      "We gave the same agent (Opus 4.8) four tasks against recently shipped CRDs: two field lookups, one manifest to write, and one manifest review with planted errors. Three setups, graded by Fable 5 against the published schemas.",
    ),
  );

  const grid = document.createElement("div");
  grid.className = "mcp-stats";
  for (const stat of BENCHMARK_STATS) {
    const panel = document.createElement("div");
    panel.className = "mcp-stat";
    panel.append(
      text("p", "mcp-stat-label", stat.label),
      text("p", "mcp-stat-value", stat.value),
      text("p", "mcp-stat-detail", stat.detail),
    );
    grid.append(panel);
  }
  section.append(
    grid,
    text(
      "p",
      "mcp-lead",
      "Accuracy is what the savings buy. From training data alone the agent got one task of four right: it invented enum values and flagged valid fields as errors. With the MCP or web search it scored four of four, but the web runs crawled raw CRDs to get there. Smaller models depend on the catalog even more: Haiku scored 0 of 4 from memory and 4 of 4 with the MCP at a quarter of the web-search cost.",
    ),
  );
  return section;
}

function createConfigSection(): HTMLElement {
  const section = createSection("Configure your agent", "configure");
  section.append(
    text(
      "p",
      "mcp-lead",
      "The server speaks standard streamable HTTP and needs no authentication or API key. Point any MCP client at the endpoint.",
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
  const section = createSection("Tools", "tools");
  section.append(text("p", "mcp-lead", "The agent starts broad and narrows down. It finds the right kind, searches its fields, and fetches the full JSON Schema only when it needs everything."));

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
