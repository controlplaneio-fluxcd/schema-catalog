// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { buildFieldTree, filterFieldLines, parseFieldsFile } from "../../shared/fields.ts";
import type { FieldLine, FieldNode } from "../../shared/fields.ts";
import { findKind, kindDisplay } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../../shared/types.ts";
import {
  clear,
  createBreadcrumb,
  createPage,
  createSearchField,
  hasFields,
  link,
  notFoundView,
  text,
} from "../dom.ts";
import { homeRoute, kindRoute, projectRoute } from "../router.ts";

/** Streamable-HTTP MCP endpoint copied by the hero's Copy MCP Server button. */
const MCP_ENDPOINT = "https://schemas.fluxoperator.dev/mcp";

const MCP_ICON =
  '<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" aria-hidden="true"><path d="M25 97.8528L92.8823 29.9706C102.255 20.598 117.451 20.598 126.823 29.9706C136.196 39.3431 136.196 54.5391 126.823 63.9117L75.5581 115.177"/><path d="M76.2653 114.47L126.823 63.9117C136.196 54.5391 151.392 54.5391 160.765 63.9117L161.118 64.2652C170.491 73.6378 170.491 88.8338 161.118 98.2063L99.7248 159.6C96.6006 162.724 96.6006 167.789 99.7248 170.913L112.331 183.52"/><path d="M109.853 46.9411L59.6482 97.1457C50.2757 106.518 50.2757 121.714 59.6482 131.087C69.0208 140.459 84.2168 140.459 93.5894 131.087L143.794 80.8822"/></svg>';

const DOWNLOAD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

const DOCS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

/** Projects whose CRDs have reference pages at fluxoperator.dev/docs/crd/<kind>/. */
const FLUX_DOCS_PROJECTS = new Set(["flux", "flux-operator"]);

/**
 * Renders a concrete group/kind/version page with schema links and, when
 * available, the fields explorer. Missing kinds or versions return a not-found
 * view so stale hash links fail closed in the UI.
 */
export function renderKind(index: CatalogIndex, group: string, kind: string, version: string): HTMLElement {
  const found = findKind(index, group, kind);
  if (found === undefined) {
    return notFoundView(`Kind "${group}/${kind}" is not in this catalog index.`);
  }

  const versionIndex = found.entry[1].indexOf(version);
  if (versionIndex === -1) {
    return notFoundView(`Version "${version}" is not available for "${group}/${kind}".`);
  }

  const display = kindDisplay(found.entry);
  const page = createPage("kind-page");
  page.append(
    createBreadcrumb([
      { label: "Home", href: homeRoute() },
      { label: found.project.alias, href: projectRoute(found.project.name) },
      { label: display },
    ]),
    createKindHero(found.project, found.entry, group, kind, version, display),
  );

  const content = document.createElement("section");
  content.className = "fields-panel";
  page.append(content);

  if (!hasFields(found.entry, versionIndex)) {
    content.append(createSchemaOnly(group, kind, version));
    return page;
  }

  loadFields(content, group, kind, version);
  return page;
}

function createKindHero(
  project: ProjectEntry,
  entry: KindEntry,
  group: string,
  kind: string,
  version: string,
  display: string,
): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero";

  const title = document.createElement("h1");
  title.textContent = display;

  const gvk = text("p", "mono gvk-line", `${group}/${version}`);
  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.append(link(projectRoute(project.name), project.alias, "project-badge badge"));

  const switcher = document.createElement("div");
  switcher.className = "version-switcher";
  switcher.setAttribute("aria-label", "Versions");
  entry[1].forEach((candidate) => {
    const chip = link(kindRoute(group, kind, candidate), candidate, "chip");
    if (candidate === version) {
      chip.classList.add("active");
      chip.setAttribute("aria-current", "page");
    }
    switcher.append(chip);
  });
  meta.append(switcher, createHeroActions(project, group, kind, version));

  hero.append(title, gvk, meta);
  return hero;
}

/** MCP copy and schema download, kept on the version row instead of a bar. */
function createHeroActions(project: ProjectEntry, group: string, kind: string, version: string): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "meta-actions";

  if (FLUX_DOCS_PROJECTS.has(project.name)) {
    const docs = link(`https://fluxoperator.dev/docs/crd/${encodeURIComponent(kind)}/`, "", "button-link docs-link");
    docs.innerHTML = DOCS_ICON;
    docs.append(text("span", "", "API Docs"));
    docs.target = "_blank";
    docs.rel = "noopener noreferrer";
    actions.append(docs);
  }

  const mcp = document.createElement("button");
  mcp.type = "button";
  mcp.className = "button-link mcp-copy";
  mcp.innerHTML = MCP_ICON;
  mcp.append(text("span", "", "Copy MCP Server"));
  mcp.title = `Copy the MCP endpoint: ${MCP_ENDPOINT}`;
  mcp.setAttribute("aria-label", "Copy the MCP server endpoint");
  const label = mcp.querySelector("span");
  mcp.addEventListener("click", () => {
    void navigator.clipboard.writeText(MCP_ENDPOINT).then(
      () => {
        if (label !== null) {
          label.textContent = "Copied";
          setTimeout(() => {
            label.textContent = "Copy MCP Server";
          }, 1600);
        }
      },
      () => {
        if (label !== null) {
          label.textContent = "Copy failed";
        }
      },
    );
  });

  const download = link(schemaUrl(group, kind, version), "", "icon-button");
  download.innerHTML = DOWNLOAD_ICON;
  download.setAttribute("download", `${kind}_${version}.json`);
  download.title = "Download JSON schema";
  download.setAttribute("aria-label", "Download JSON schema");

  actions.append(mcp, download);
  return actions;
}

function createSchemaOnly(group: string, kind: string, version: string): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "empty-state";
  panel.append(
    text("h2", "", "Schema only"),
    text("p", "", "This kind does not include a fields index. Use the raw JSON schema for validation and inspection."),
    link(schemaUrl(group, kind, version), "Open raw JSON schema", "button-link primary"),
  );
  return panel;
}

function loadFields(content: HTMLElement, group: string, kind: string, version: string): void {
  const url = fieldsUrl(group, kind, version);
  content.append(text("p", "muted", "Loading fields…"));

  void fetch(url).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      const lines = parseFieldsFile(await response.text());
      renderFieldsExplorer(content, lines);
    },
    (error: unknown) => {
      renderFetchError(content, url, error);
    },
  ).catch((error: unknown) => {
    renderFetchError(content, url, error);
  });
}

function renderFetchError(content: HTMLElement, url: string, error: unknown): void {
  clear(content);
  const message = error instanceof Error ? error.message : String(error);
  const panel = document.createElement("div");
  panel.className = "empty-state error-state";
  panel.append(text("h2", "", "Could not load fields"), text("p", "", `Tried ${url}`), text("p", "muted", message));
  content.append(panel);
}

function renderFieldsExplorer(content: HTMLElement, lines: FieldLine[]): void {
  clear(content);
  const tree = buildFieldTree(lines);
  const toolbar = document.createElement("div");
  toolbar.className = "fields-toolbar";

  const { field: filterWrap, input: filter } = createSearchField({
    id: "field-filter",
    placeholder: "Filter fields (regex)…",
    ariaLabel: "Filter fields, regex supported",
  });

  const count = text("span", "fields-count", "");
  toolbar.append(filterWrap, count);

  const results = document.createElement("div");
  results.className = "fields-results";
  content.append(toolbar, results);

  const render = (): void => {
    clear(results);
    const query = filter.value.trim();
    if (query === "") {
      count.textContent = `${lines.length} fields`;
      results.append(renderFieldTree(tree));
      return;
    }

    const filtered = filterFieldLines(lines, { query, limit: FILTER_RENDER_CAP, queryMode: "regex-or-substring" });
    count.textContent = `${filtered.total} of ${lines.length} fields`;
    results.append(renderFieldList(filtered.matches));
    if (filtered.total > filtered.matches.length) {
      results.append(
        text("p", "field-list-note", `Showing the first ${filtered.matches.length} matches, narrow the filter for the rest.`),
      );
    }
  };

  // Debounced: the largest fields files run to ~8k lines and a synchronous
  // re-render per keystroke would jank the input.
  let pending = 0;
  filter.addEventListener("input", () => {
    clearTimeout(pending);
    pending = window.setTimeout(render, 120);
  });
  render();
}

const FILTER_RENDER_CAP = 500;

function renderFieldList(lines: FieldLine[]): HTMLElement {
  const list = document.createElement("div");
  list.className = "field-list";
  for (const line of lines) {
    const row = document.createElement("div");
    row.className = "field-row";
    row.append(
      createFieldPath(line.path),
      text("span", "field-type", line.type),
      ...renderConstraintTokens(line.constraints),
      createDescription(line.description),
    );
    list.append(row);
  }
  return list;
}

/** Renders a dotted path with the parent segments dimmed and the leaf bold. */
function createFieldPath(path: string): HTMLElement {
  const element = document.createElement("code");
  element.className = "field-path";
  const cut = path.lastIndexOf(".");
  if (cut === -1) {
    element.append(text("span", "field-path-leaf", path));
  } else {
    element.append(
      text("span", "field-path-parent", path.slice(0, cut + 1)),
      text("span", "field-path-leaf", path.slice(cut + 1)),
    );
  }
  return element;
}

/**
 * Tokenizes a constraints string following the fields-index line grammar:
 * parenthesized markers become chips, `key=value` pairs keep the key dim and
 * the value highlighted. Values are JSON-encoded upstream, so a quoted pattern
 * never splits mid-token.
 */
function renderConstraintTokens(constraints: string): HTMLElement[] {
  const tokens: HTMLElement[] = [];
  const pattern = /\((required|immutable|deprecated|cluster-scoped)\)|([a-z]+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(constraints)) !== null) {
    if (match[1] !== undefined) {
      const marker = match[1];
      const variant = marker === "required" ? "required" : marker === "deprecated" ? "deprecated" : "neutral";
      tokens.push(text("span", `constraint-marker constraint-${variant}`, marker));
      continue;
    }
    const pair = document.createElement("span");
    pair.className = "constraint-pair";
    pair.append(text("span", "constraint-key", `${match[2] ?? ""}=`), text("span", "constraint-value", match[3] ?? ""));
    pair.title = match[0];
    tokens.push(pair);
  }
  return tokens;
}

function renderFieldTree(root: FieldNode): HTMLElement {
  const tree = document.createElement("div");
  tree.className = "field-tree";
  for (const child of root.children.values()) {
    tree.append(renderFieldNode(child, child.segment === "spec"));
  }
  return tree;
}

function renderFieldNode(node: FieldNode, startOpen: boolean): HTMLElement {
  const details = document.createElement("details");
  details.className = "field-node";
  if (node.children.size === 0) {
    details.classList.add("leaf");
  }

  const children = document.createElement("div");
  children.className = "field-children";
  let populated = false;
  const populate = (): void => {
    if (populated) {
      return;
    }
    populated = true;
    for (const child of node.children.values()) {
      children.append(renderFieldNode(child, false));
    }
  };

  details.addEventListener("toggle", () => {
    if (details.open) {
      populate();
    }
  });

  details.append(createFieldSummary(node), children);
  if (startOpen) {
    details.open = true;
    populate();
  }
  return details;
}

function createFieldSummary(node: FieldNode): HTMLElement {
  const summary = document.createElement("summary");
  summary.className = "field-summary";

  const marker = text("span", "details-marker", "›");
  const segment = text("code", "field-segment", node.segment);
  summary.append(marker, segment);

  if (node.line !== undefined) {
    summary.append(text("span", "field-type", node.line.type));
    summary.append(...renderConstraintTokens(node.line.constraints));
    summary.append(createDescription(node.line.description));
  }

  return summary;
}

function createDescription(description: string): HTMLElement {
  const element = text("span", "field-description muted", description);
  if (description !== "") {
    element.title = description;
  }
  return element;
}

function schemaUrl(group: string, kind: string, version: string): string {
  return `/catalog/${encodeURIComponent(group)}/${encodeURIComponent(kind)}_${encodeURIComponent(version)}.json`;
}

function fieldsUrl(group: string, kind: string, version: string): string {
  return `/catalog/${encodeURIComponent(group)}/${encodeURIComponent(kind)}_${encodeURIComponent(version)}.fields.txt`;
}
