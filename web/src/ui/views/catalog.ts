// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex, ProjectEntry } from "../../shared/types.ts";
import { kindCount, projectVersionLabel, schemaCount } from "../../shared/index-query.ts";
import {
  clear,
  CNCF_ICON,
  CNCF_SHIELDS,
  createBadge,
  createBreadcrumb,
  createExternalIcon,
  createPage,
  createSearchField,
  createShield,
  formatDate,
  GITHUB_ICON,
  K8S_ICON,
  link,
  REPO_URL,
  text,
} from "../dom.ts";
import { agentsRoute, catalogCategoryRoute, categorySlug, homeRoute, projectRoute } from "../router.ts";

/** Live filter text, persisted so the explorer state survives view re-renders. */
let activeQuery = "";
/** Active category index, or -1 for all categories; hydrated from the URL. */
let activeCategory = -1;
/** Active scope tab: every project, or CNCF ones (including Kubernetes SIGs). */
let activeScope: "all" | "cncf" = "all";

/**
 * A project is in the CNCF scope when it carries a foundation maturity, or when
 * it belongs to the Kubernetes project itself (kubernetes/ and kubernetes-sigs/
 * repos, which ship no maturity of their own).
 */
function inScope(project: ProjectEntry): boolean {
  if (activeScope === "all") {
    return true;
  }
  return (
    project.cncf !== undefined ||
    project.repo.startsWith("kubernetes/") ||
    project.repo.startsWith("kubernetes-sigs/")
  );
}

/**
 * Renders the catalog explorer: every project as a filterable card, grouped by
 * CNCF category. A sticky toolbar carries the text filter and category toggles;
 * cards show version, category, CNCF status, and kind/schema counts, and link
 * to the project page. The active category is mirrored in the URL hash so a
 * filtered view is shareable; text filtering happens in place.
 */
export function renderCatalog(index: CatalogIndex): HTMLElement {
  const page = createPage("catalog-page");
  activeCategory = categoryFromUrl(index);

  const projects = index.projects.length;
  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);
  const schemas = index.projects.reduce((total, project) => total + schemaCount(project), 0);

  page.append(
    createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "Catalog" }]),
    createHead(projects, kinds, schemas),
  );

  const results = document.createElement("div");
  results.className = "catalog-results";

  const count = text("p", "catalog-count", "");
  count.hidden = true;

  const { field: searchWrap, input: search } = createSearchField({
    id: "catalog-filter",
    placeholder: "Filter projects",
    ariaLabel: "Filter projects by name, API group, or kind",
    value: activeQuery,
  });

  const chipRow = document.createElement("div");
  chipRow.className = "catalog-chips";
  chipRow.setAttribute("role", "group");
  chipRow.setAttribute("aria-label", "Filter by category");

  const render = (): void => {
    activeQuery = search.value;
    const needle = activeQuery.trim().toLowerCase();
    clear(results);

    let shown = 0;
    for (let categoryIndex = 0; categoryIndex < index.categories.length; categoryIndex += 1) {
      if (activeCategory !== -1 && activeCategory !== categoryIndex) {
        continue;
      }
      const matches = index.projects
        .filter((project) => project.cat === categoryIndex && inScope(project) && projectMatches(project, needle))
        .sort((a, b) => a.alias.localeCompare(b.alias));
      if (matches.length === 0) {
        continue;
      }
      shown += matches.length;
      results.append(createCategoryGroup(index.categories[categoryIndex] ?? "", matches));
    }

    if (shown === 0) {
      results.append(createEmptyState(index, activeQuery.trim()));
      count.hidden = true;
    } else if (needle === "") {
      // No text query: the category toggle and group headings already carry
      // the counts, so the standalone count line would just repeat them.
      count.hidden = true;
    } else {
      count.textContent = `${shown} ${shown === 1 ? "project" : "projects"}`;
      count.hidden = false;
    }
  };

  buildChips(index, chipRow, render);

  const scopeTabs = createScopeTabs(() => {
    // Drop a category selection that has no projects under the new scope, so
    // the toolbar never points at a chip that no longer exists.
    if (
      activeCategory !== -1 &&
      !index.projects.some((project) => project.cat === activeCategory && inScope(project))
    ) {
      activeCategory = -1;
      writeCategoryUrl(index, activeCategory);
    }
    buildChips(index, chipRow, render);
    render();
  });

  const searchRow = document.createElement("div");
  searchRow.className = "catalog-search-row";
  searchRow.append(searchWrap, scopeTabs);

  const toolbar = document.createElement("div");
  toolbar.className = "catalog-toolbar";
  toolbar.append(searchRow, chipRow);

  page.append(toolbar, count, results);

  search.addEventListener("input", render);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value !== "") {
      search.value = "";
      render();
    }
  });

  render();
  return page;
}

function createHead(projects: number, kinds: number, schemas: number): HTMLElement {
  const head = document.createElement("section");
  head.className = "catalog-head";

  const lead = text("p", "catalog-lead", "");
  lead.append(
    document.createTextNode("JSON Schemas with "),
    link(agentsRoute(), "LLM-optimized"),
    document.createTextNode(" indexes for Kubernetes and the CNCF Ecosystem."),
  );

  const addLink = link(`${REPO_URL}/issues/new?template=add-project.yaml`, "", "catalog-add-link");
  addLink.target = "_blank";
  addLink.rel = "noopener noreferrer";
  addLink.append(document.createTextNode("Add a project"), createExternalIcon());

  const metaRow = document.createElement("div");
  metaRow.className = "catalog-meta-row";
  metaRow.append(
    text(
      "p",
      "catalog-count-line",
      `${projects.toLocaleString("en-US")} projects · ${kinds.toLocaleString("en-US")} kinds · ${schemas.toLocaleString("en-US")} schemas`,
    ),
    addLink,
  );

  head.append(text("h1", "catalog-title", "Schema Catalog"), lead, metaRow);
  return head;
}

/** Renders the no-results panel, naming the active category when one is set. */
function createEmptyState(index: CatalogIndex, query: string): HTMLElement {
  const empty = document.createElement("section");
  empty.className = "empty-state";
  const category = activeCategory === -1 ? undefined : index.categories[activeCategory];
  const message = category === undefined
    ? `Nothing matches "${query}". Try a kind, API group, or project name.`
    : `Nothing matches "${query}" in ${category}.`;
  empty.append(text("h2", "", "No projects match"), text("p", "", message));
  return empty;
}

/**
 * Builds the [All | CNCF] scope tabs. Switching a tab updates the module scope
 * and hands control back to the caller to rebuild the dependent UI.
 */
function createScopeTabs(onChange: () => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "catalog-scope";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Filter by origin");

  const tabs: Array<{ button: HTMLButtonElement; scope: typeof activeScope }> = [];

  const applyActive = (): void => {
    for (const tab of tabs) {
      const isActive = tab.scope === activeScope;
      tab.button.classList.toggle("active", isActive);
      tab.button.setAttribute("aria-pressed", String(isActive));
    }
  };

  for (const option of [
    { label: "All", scope: "all" },
    { label: "CNCF", scope: "cncf" },
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "catalog-scope-tab";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      if (activeScope === option.scope) {
        return;
      }
      activeScope = option.scope;
      applyActive();
      onChange();
    });
    tabs.push({ button, scope: option.scope });
    wrap.append(button);
  }

  applyActive();
  return wrap;
}

/**
 * Builds one toggle button per non-empty category. Clicking a category selects
 * it; clicking the active one clears back to all categories. The selection is
 * written to the URL hash so the view is linkable.
 */
function buildChips(index: CatalogIndex, row: HTMLElement, render: () => void): void {
  clear(row);
  const chips: HTMLButtonElement[] = [];

  const applyActive = (): void => {
    for (const chip of chips) {
      const isActive = Number(chip.dataset["cat"]) === activeCategory;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    }
  };

  const toggle = (categoryIndex: number): void => {
    activeCategory = activeCategory === categoryIndex ? -1 : categoryIndex;
    writeCategoryUrl(index, activeCategory);
    applyActive();
    render();
  };

  for (let categoryIndex = 0; categoryIndex < index.categories.length; categoryIndex += 1) {
    const name = index.categories[categoryIndex];
    const total = index.projects.filter((project) => project.cat === categoryIndex && inScope(project)).length;
    if (name === undefined || total === 0) {
      continue;
    }
    const chip = createChip(name, categoryIndex, toggle, total);
    chips.push(chip);
    row.append(chip);
  }

  applyActive();
}

function createChip(label: string, categoryIndex: number, onToggle: (index: number) => void, total: number): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "catalog-chip";
  chip.dataset["cat"] = String(categoryIndex);
  chip.append(text("span", "", label), text("span", "catalog-chip-count", String(total)));
  chip.addEventListener("click", () => onToggle(categoryIndex));
  return chip;
}

/** Reads the active category from the URL hash, or -1 when absent or unknown. */
function categoryFromUrl(index: CatalogIndex): number {
  const slug = decodeURIComponent(location.hash.replace(/^#/, "")).toLowerCase();
  if (slug === "") {
    return -1;
  }
  return index.categories.findIndex((name) => categorySlug(name) === slug);
}

/** Mirrors the active category into the URL hash without a history entry or scroll. */
function writeCategoryUrl(index: CatalogIndex, categoryIndex: number): void {
  const name = categoryIndex === -1 ? undefined : index.categories[categoryIndex];
  const target = name === undefined ? location.pathname : catalogCategoryRoute(name);
  history.replaceState(history.state, "", target);
}

function createCategoryGroup(category: string, projects: ProjectEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "catalog-group";

  const heading = text("h2", "catalog-group-title", category);
  heading.append(text("span", "catalog-group-count", String(projects.length)));
  section.append(heading);

  const grid = document.createElement("div");
  grid.className = "catalog-grid";
  for (const project of projects) {
    grid.append(createProjectCard(project));
  }
  section.append(grid);
  return section;
}

function createProjectCard(project: ProjectEntry): HTMLElement {
  const card = link(projectRoute(project.name), "", "explorer-card");
  card.setAttribute("aria-label", `${project.alias} ${projectVersionLabel(project)}`);

  const head = document.createElement("div");
  head.className = "explorer-card-head";
  head.append(
    text("span", "explorer-card-name", project.alias),
    createBadge(projectVersionLabel(project), "version-badge"),
  );
  card.append(head);

  const shields = document.createElement("div");
  shields.className = "explorer-card-shields";
  const cncfShield = project.cncf === undefined ? undefined : CNCF_SHIELDS[project.cncf];
  if (cncfShield !== undefined) {
    shields.append(createShield(CNCF_ICON, cncfShield.label, cncfShield.variant));
  }
  if (project.repo.startsWith("kubernetes-sigs/")) {
    shields.append(createShield(K8S_ICON, "Kubernetes SIG", "shield-k8s-sig"));
  }
  if (shields.childElementCount === 0) {
    // No foundation status to show: fall back to provenance, the GitHub org.
    shields.append(createShield(GITHUB_ICON, project.repo.split("/")[0] ?? project.repo, "shield-repo"));
  }
  card.append(shields);

  card.append(
    text(
      "span",
      "explorer-card-stats",
      `${kindCount(project)} kinds · ${schemaCount(project)} schemas · updated ${formatDate(project.builtAt)}`,
    ),
  );
  return card;
}

/** Matches a project against a lowercased needle over alias, name, members, groups, and kinds. */
function projectMatches(project: ProjectEntry, needle: string): boolean {
  if (needle === "") {
    return true;
  }
  if (project.alias.toLowerCase().includes(needle) || project.name.toLowerCase().includes(needle)) {
    return true;
  }
  for (const member of project.sources ?? []) {
    if (member.alias.toLowerCase().includes(needle) || member.name.toLowerCase().includes(needle)) {
      return true;
    }
  }
  for (const group of project.groups) {
    if (group.g.toLowerCase().includes(needle)) {
      return true;
    }
    for (const entry of group.kinds) {
      if (entry[0].includes(needle) || (entry[3] ?? "").toLowerCase().includes(needle)) {
        return true;
      }
    }
  }
  return false;
}
