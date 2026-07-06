// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex } from "../../shared/types.ts";
import {
  createBreadcrumb,
  createPage,
  createSiteHeader,
  kindCount,
  link,
  schemaCount,
  text,
} from "../dom.ts";
import { homeRoute } from "../router.ts";

/** Public streamable-HTTP MCP endpoint advertised to agents. */
const MCP_ENDPOINT = "https://schemas.fluxoperator.dev/mcp";

const CLAUDE_COMMAND = `claude mcp add --transport http flux-schema-catalog ${MCP_ENDPOINT}`;

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
    title: "Ground truth, not guesses",
    body:
      "Every kind, field, type, and constraint is extracted from the project's published API definitions. The agent looks it up instead of reconstructing it from training data.",
  },
  {
    title: "Write valid manifests",
    body:
      "A HelmRelease, a Gateway, a Cilium policy — the agent pulls the schema for the exact apiVersion it targets and only uses fields that actually exist.",
  },
  {
    title: "Review with authority",
    body:
      "Point the agent at existing manifests and it verifies field paths, required values, and deprecations against the real schema — before the cluster rejects them.",
  },
  {
    title: "Rebuilt daily",
    body:
      "The catalog tracks upstream releases automatically, so new CRDs, kinds, and apiVersions land within a day of shipping — nothing for you to update.",
  },
];

const TOOLS: Array<{ name: string; description: string }> = [
  { name: "search_catalog", description: "Resolve a keyword to matching API groups, kinds, and versions." },
  { name: "list_projects", description: "Enumerate the covered projects, optionally by CNCF category." },
  { name: "get_project", description: "Fetch one project's groups, kinds, versions, and field-index coverage." },
  { name: "get_schema", description: "Fetch the complete JSON Schema for a group/kind/version." },
  { name: "search_fields", description: "Look up exact field paths, types, constraints, and descriptions for a kind — one line per field, cheaper than the full schema." },
];

/**
 * Renders the MCP server page: what the catalog gives an AI agent, how to wire
 * the endpoint into any MCP client, and the tools it exposes. Counts are read
 * from the generated index so the pitch stays concrete.
 */
export function renderMcp(index: CatalogIndex): HTMLElement {
  const page = createPage("mcp-page");
  page.append(
    createSiteHeader(),
    createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "MCP server" }]),
    createHero(index),
    createWhySection(),
    createConfigSection(),
    createToolsSection(),
    createPageFooter(),
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
    text("h1", "", "MCP Server"),
    text(
      "p",
      "mcp-tagline",
      "Stop your AI agent from guessing Kubernetes YAML. One endpoint serves the exact schema — kinds, fields, types, constraints, apiVersions — for every resource it writes, edits, or reviews.",
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
      "Language models write Kubernetes YAML with confidence but without a source: invented field names, misremembered apiVersions, required values silently dropped. This server closes the gap. It streams curated JSON Schemas and greppable field indexes for the Kubernetes ecosystem — core Kubernetes, OpenShift, the Flux ecosystem, and a growing set of CNCF projects, controllers, and operators — straight into your agent over MCP.",
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
      "Standard streamable-HTTP MCP transport, no authentication, no API key. Point any MCP-capable agent at the endpoint and it is ready.",
    ),
    text("h3", "", "Claude Code"),
    createCodeBlock(CLAUDE_COMMAND),
    text("h3", "", "Other MCP clients (Cursor, VS Code, Windsurf, …)"),
    createCodeBlock(CLIENT_CONFIG),
  );
  return section;
}

function createToolsSection(): HTMLElement {
  const section = createSection("Tools");
  section.append(text("p", "mcp-lead", "Five tools, meant to be called in narrowing order: discover the group and kind, check individual fields cheaply, and pull the full schema only when needed."));

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

function createPageFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "mcp-page-footer";
  footer.append(
    link(homeRoute(), "Browse the catalog"),
    link("https://github.com/controlplaneio-fluxcd/schema-catalog", "GitHub"),
    link("https://fluxoperator.dev", "fluxoperator.dev"),
  );
  return footer;
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "mcp-section";
  section.append(text("h2", "", title));
  return section;
}

function createCodeBlock(code: string): HTMLElement {
  const block = document.createElement("div");
  block.className = "code-block";

  const pre = document.createElement("pre");
  const codeElement = document.createElement("code");
  codeElement.textContent = code;
  pre.append(codeElement);

  block.append(pre, createCopyButton(code, "Copy", "code-copy"));
  return block;
}

function createCopyButton(value: string, label: string, variantClass: string): HTMLButtonElement {
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = variantClass === "" ? "copy-button" : `copy-button ${variantClass}`;
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", label);
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        copy.textContent = "Copied";
        setTimeout(() => {
          copy.textContent = "Copy";
        }, 1600);
      },
      () => {
        copy.textContent = "Copy failed";
      },
    );
  });
  return copy;
}
