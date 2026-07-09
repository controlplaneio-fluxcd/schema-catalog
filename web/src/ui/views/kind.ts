// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { buildFieldTree, filterFieldLines, parseFieldsFile } from "../../shared/fields.ts";
import type { FieldLine, FieldNode } from "../../shared/fields.ts";
import { findKind, hasFields, kindDisplay, kindSource } from "../../shared/index-query.ts";
import type { CatalogIndex, GroupEntry, KindEntry, ProjectEntry } from "../../shared/types.ts";
import {
  clear,
  createBreadcrumb,
  createPage,
  createProjectLogo,
  createSearchField,
  link,
  notFoundView,
  text,
} from "../dom.ts";
import { createJsonTree } from "../json-tree.ts";
import { catalogRoute, homeRoute, kindRoute, navigate, projectRoute } from "../router.ts";

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
      { label: "Catalog", href: catalogRoute() },
      { label: found.project.alias, href: projectRoute(found.project.name) },
      { label: display },
    ]),
    createKindHero(found.project, found.group, found.entry, group, kind, version, display),
  );

  const content = document.createElement("section");
  content.className = "fields-panel";
  page.append(content);

  renderSchemaViewer(content, group, kind, version, hasFields(found.entry, versionIndex));
  return page;
}

/**
 * The schema viewer: a JSON | Index tab pair over the same schema, sharing
 * one filter box and expand/collapse-all controls. Index is the greppable
 * fields explorer; JSON is the raw document rendered as a schema-aware tree
 * where descriptions keep their original line breaks. Each tab fetches its
 * document lazily on first activation and the filter re-applies on switch.
 * Versions without a fields index get the JSON view with Index disabled.
 */
function renderSchemaViewer(content: HTMLElement, group: string, kind: string, version: string, withIndex: boolean): void {
  const toolbar = document.createElement("div");
  toolbar.className = "fields-toolbar";

  const tabs = document.createElement("div");
  tabs.className = "catalog-scope";
  const indexTab = createViewerTab("Index");
  const jsonTab = createViewerTab("JSON");
  tabs.append(indexTab, jsonTab);

  const { field: filterWrap, input: filter } = createSearchField({
    id: "viewer-filter",
    placeholder: "Filter fields (regex)…",
    ariaLabel: "Filter fields, regex supported",
  });
  const count = text("span", "fields-count", "");

  // On the JSON tab the filter and count trade places with a download link
  // for the raw document.
  const download = link(schemaUrl(group, kind, version), "", "download-link");
  download.innerHTML = DOWNLOAD_ICON;
  download.append(text("span", "", `${kind}_${version}.json`));
  download.setAttribute("download", `${kind}_${version}.json`);
  download.setAttribute("aria-label", "Download JSON schema");

  const actions = document.createElement("div");
  actions.className = "viewer-actions";
  const expand = createTreeButton(EXPAND_ICON, "Expand all");
  const collapse = createTreeButton(COLLAPSE_ICON, "Collapse all");
  actions.append(expand, collapse);
  toolbar.append(tabs, filterWrap, count, download, actions);

  const indexBody = document.createElement("div");
  const jsonBody = document.createElement("div");
  content.append(toolbar, indexBody, jsonBody);

  // The active tab is linkable: /k/<group>/<kind>/<version>#json.
  let active: "json" | "index" = withIndex && location.hash !== "#json" ? "index" : "json";
  let indexView: IndexView | undefined;
  let jsonStarted = false;

  const activate = (): void => {
    if (active === "index") {
      indexView?.render(filter.value.trim());
    }
  };

  const select = (tab: "json" | "index"): void => {
    active = tab;
    const json = tab === "json";
    jsonTab.classList.toggle("active", json);
    indexTab.classList.toggle("active", !json);
    jsonBody.hidden = !json;
    indexBody.hidden = json;
    filterWrap.hidden = json;
    count.hidden = json;
    download.hidden = !json;
    history.replaceState(null, "", location.pathname + (json ? "#json" : ""));
    if (json && !jsonStarted) {
      jsonStarted = true;
      loadSchemaJson(jsonBody, group, kind, version);
      return;
    }
    if (!json && indexView === undefined) {
      loadFields(count, indexBody, group, kind, version, (view) => {
        indexView = view;
        activate();
      });
      return;
    }
    activate();
  };

  jsonTab.addEventListener("click", () => {
    select("json");
  });
  indexTab.addEventListener("click", () => {
    select("index");
  });

  // Debounced: the largest fields files run to ~8k lines and a synchronous
  // re-render per keystroke would jank the input.
  let pending = 0;
  filter.addEventListener("input", () => {
    clearTimeout(pending);
    pending = window.setTimeout(activate, 120);
  });

  expand.addEventListener("click", () => {
    expandAll(active === "json" ? jsonBody : indexBody);
  });
  collapse.addEventListener("click", () => {
    collapseAll(active === "json" ? jsonBody : indexBody);
  });

  if (!withIndex) {
    indexTab.disabled = true;
    indexTab.title = "No fields index for this version";
  }
  select(active);
}

/** The fields explorer, re-rendered with the filter query on activation. */
interface IndexView {
  render: (query: string) => void;
}

function createViewerTab(label: string): HTMLButtonElement {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "catalog-scope-tab";
  tab.textContent = label;
  return tab;
}

const EXPAND_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="7 9 12 4 17 9"/><polyline points="7 15 12 20 17 15"/></svg>';

const COLLAPSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="7 4 12 9 17 4"/><polyline points="7 20 12 15 17 20"/></svg>';

function createTreeButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.innerHTML = icon;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

/** Opens every branch level by level, letting lazy children populate. */
function expandAll(root: HTMLElement): void {
  void (async () => {
    for (;;) {
      const closed = root.querySelectorAll<HTMLDetailsElement>("details:not([open])");
      if (closed.length === 0) {
        return;
      }
      for (const node of closed) {
        node.open = true;
      }
      // The toggle event that populates lazy children fires asynchronously.
      await new Promise((resolve) => setTimeout(resolve));
    }
  })();
}

function collapseAll(root: HTMLElement): void {
  for (const node of root.querySelectorAll<HTMLDetailsElement>("details[open]")) {
    node.open = false;
  }
}

function loadSchemaJson(content: HTMLElement, group: string, kind: string, version: string): void {
  const url = schemaUrl(group, kind, version);
  content.append(text("p", "muted", "Loading schema…"));

  void fetch(url).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      const value = (await response.json()) as unknown;
      clear(content);
      const results = document.createElement("div");
      results.className = "fields-results";
      results.append(createJsonTree(value));
      content.append(results);
    },
    (error: unknown) => {
      renderFetchError(content, url, error);
    },
  ).catch((error: unknown) => {
    renderFetchError(content, url, error);
  });
}

function createKindHero(
  project: ProjectEntry,
  groupEntry: GroupEntry,
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
  // One provenance badge: the owning source and its release version (e.g.
  // "AWS S3 Controller v1.8.1"), linking to the project page. The group name
  // stays out of the hero; the version is never shown bare next to the API
  // version switcher.
  const owner = kindSource(project, groupEntry, entry);
  const alias = owner?.alias ?? project.alias;
  const release = owner?.version ?? project.version;
  const label = release === undefined ? alias : `${alias} ${release}`;
  meta.append(link(projectRoute(project.name), label, "project-badge badge"));

  meta.append(createVersionSwitcher(group, kind, entry[1], version), createHeroActions(project, group, kind, version));

  const logo = createProjectLogo(project);
  if (logo === null) {
    hero.append(title, gvk, meta);
  } else {
    const head = document.createElement("div");
    head.className = "hero-head";
    head.append(logo, title);
    hero.append(head, gvk, meta);
  }
  return hero;
}

/**
 * Past this many versions the segmented switcher would wrap into rows (ASO
 * kinds carry up to 16 dated versions), so it collapses into a select.
 */
const VERSION_SELECT_MAX = 5;

function createVersionSwitcher(group: string, kind: string, versions: string[], current: string): HTMLElement {
  if (versions.length > VERSION_SELECT_MAX) {
    return createVersionSelect(group, kind, versions, current);
  }
  const switcher = document.createElement("div");
  switcher.className = "version-switcher";
  switcher.setAttribute("aria-label", "Versions");
  for (const candidate of versions) {
    const tab = link(kindRoute(group, kind, candidate), candidate, "switcher-tab");
    if (candidate === current) {
      tab.classList.add("active");
      tab.setAttribute("aria-current", "page");
    }
    switcher.append(tab);
  }
  return switcher;
}

function createVersionSelect(group: string, kind: string, versions: string[], current: string): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "version-picker";

  const wrap = document.createElement("span");
  wrap.className = "version-select";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Versions");
  for (const candidate of versions) {
    const option = document.createElement("option");
    option.value = candidate;
    option.textContent = candidate;
    option.selected = candidate === current;
    select.append(option);
  }
  select.addEventListener("change", () => {
    navigate(kindRoute(group, kind, select.value));
  });
  // A select sizes itself to its longest option; size it to the current value
  // instead (mono font, so ch is exact). Navigation re-renders the hero.
  select.style.width = `calc(${current.length}ch + 44px)`;
  wrap.append(select);

  picker.append(wrap, text("span", "switcher-count", `${versions.length} versions`));
  return picker;
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

  actions.append(mcp);
  return actions;
}

function loadFields(
  count: HTMLElement,
  content: HTMLElement,
  group: string,
  kind: string,
  version: string,
  done: (view: IndexView) => void,
): void {
  const url = fieldsUrl(group, kind, version);
  content.append(text("p", "muted", "Loading fields…"));

  void fetch(url).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      const lines = parseFieldsFile(await response.text());
      done(createIndexView(count, content, lines));
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

function createIndexView(count: HTMLElement, content: HTMLElement, lines: FieldLine[]): IndexView {
  clear(content);
  // Built once so expansion state survives filter round-trips.
  const tree = renderFieldTree(buildFieldTree(lines));
  const results = document.createElement("div");
  results.className = "fields-results";
  content.append(results);

  return {
    render: (query: string): void => {
      clear(results);
      if (query === "") {
        count.textContent = `${lines.length} fields`;
        results.append(tree);
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
    },
  };
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
