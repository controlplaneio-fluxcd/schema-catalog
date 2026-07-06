// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { buildFieldTree, filterFieldLines, parseFieldsFile } from "../../shared/fields.ts";
import type { FieldLine, FieldNode } from "../../shared/fields.ts";
import { findKind } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../../shared/types.ts";
import {
  clear,
  createBadge,
  createBreadcrumb,
  createPage,
  createSiteHeader,
  hasFields,
  link,
  notFoundView,
  text,
} from "../dom.ts";
import { homeRoute, kindRoute, projectRoute } from "../router.ts";

/**
 * Copyable validation command shown in the kind view. It intentionally points at
 * the public catalog root, not a specific schema URL, because `flux-schema`
 * resolves GVK-specific files beneath that root.
 */
const VALIDATE_COMMAND = "flux-schema validate <path> --schema-location https://schemas.fluxoperator.dev/catalog";

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

  const page = createPage("kind-page");
  page.append(
    createSiteHeader(),
    createBreadcrumb([
      { label: "Home", href: homeRoute() },
      { label: found.project.alias, href: projectRoute(found.project.name) },
      { label: kind },
    ]),
    createKindHero(found.project, found.entry, group, kind, version),
    createActions(found.entry, group, kind, version, versionIndex),
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
): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero";

  const title = document.createElement("h1");
  title.textContent = kind;

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

  hero.append(title, gvk, meta, switcher);
  return hero;
}

function createActions(entry: KindEntry, group: string, kind: string, version: string, versionIndex: number): HTMLElement {
  const actions = document.createElement("section");
  actions.className = "action-row";

  actions.append(link(schemaUrl(group, kind, version), "Raw JSON schema", "button-link"));
  if (hasFields(entry, versionIndex)) {
    actions.append(link(fieldsUrl(group, kind, version), "Raw fields.txt", "button-link"));
  }

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "button-link";
  copy.textContent = "Copy validate command";
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(VALIDATE_COMMAND).then(
      () => {
        copy.textContent = "Copied";
      },
      (error: unknown) => {
        copy.textContent = error instanceof Error ? `Copy failed: ${error.message}` : "Copy failed";
      },
    );
  });
  actions.append(copy);
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

  const filter = document.createElement("input");
  filter.id = "field-filter";
  filter.name = "field-filter";
  filter.className = "filter-input";
  filter.type = "search";
  filter.placeholder = "Filter fields…";
  filter.autocomplete = "off";
  filter.setAttribute("aria-label", "Filter fields");

  const count = text("span", "fields-count", "");
  toolbar.append(filter, count);

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

    const filtered = filterFieldLines(lines, { query, limit: FILTER_RENDER_CAP });
    count.textContent = `${filtered.total} of ${lines.length} fields`;
    results.append(renderFieldList(filtered.matches));
    if (filtered.total > filtered.matches.length) {
      results.append(
        text("p", "field-list-note", `Showing the first ${filtered.matches.length} matches — narrow the filter for the rest.`),
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
      text("code", "field-path", line.path),
      text("span", "field-type", line.type),
      text("span", "field-constraints muted", line.constraints),
      createDescription(line.description),
    );
    list.append(row);
  }
  return list;
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
    const constraints = splitConstraints(node.line.constraints);
    summary.append(text("span", "field-type", node.line.type));
    if (constraints.required) {
      summary.append(createBadge("(required)", "required-badge"));
    }
    if (constraints.remaining !== "") {
      summary.append(text("span", "field-constraints muted", constraints.remaining));
    }
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

function splitConstraints(value: string): { required: boolean; remaining: string } {
  const required = /\brequired\b/i.test(value);
  const remaining = value
    .replace(/\(?\brequired\b\)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { required, remaining };
}

function schemaUrl(group: string, kind: string, version: string): string {
  return `/catalog/${encodeURIComponent(group)}/${encodeURIComponent(kind)}_${encodeURIComponent(version)}.json`;
}

function fieldsUrl(group: string, kind: string, version: string): string {
  return `/catalog/${encodeURIComponent(group)}/${encodeURIComponent(kind)}_${encodeURIComponent(version)}.fields.txt`;
}
