// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { hasFields, kindCount, kindDisplay, latestVersion, projectVersionLabel, schemaCount } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry, ProjectSourceEntry } from "../../shared/types.ts";
import {
  CATEGORY_ICON,
  categoryName,
  CNCF_ICON,
  CNCF_SHIELDS,
  createBadge,
  createBreadcrumb,
  createPage,
  createRepoLink,
  createShield,
  formatDate,
  K8S_ICON,
  link,
  notFoundView,
  text,
} from "../dom.ts";
import { homeRoute, kindRoute } from "../router.ts";

/**
 * Renders one project page from the generated index. Missing project names
 * return a normal not-found view instead of throwing so hash routes stay
 * recoverable.
 */
export function renderProject(index: CatalogIndex, projectName: string): HTMLElement {
  // Member source names fall back to their project group so routes minted
  // before a source was grouped (e.g. /project/ack-s3) keep resolving.
  const project =
    index.projects.find((candidate) => candidate.name === projectName) ??
    index.projects.find((candidate) => candidate.sources?.some((member) => member.name === projectName));
  if (project === undefined) {
    return notFoundView(`Project "${projectName}" is not in this catalog index.`);
  }

  const page = createPage("project-page");
  page.append(
    createBreadcrumb([
      { label: "Home", href: homeRoute() },
      { label: project.alias },
    ]),
    createProjectHero(index, project),
  );

  // Index groups are alphabetical; the legacy "core" group (Pod, Service, ...)
  // is what readers scan for first, so it jumps the queue.
  const schemasPanel = document.createElement("div");
  const groups = [...project.groups].sort((a, b) => Number(b.g === "core") - Number(a.g === "core"));
  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "group-section";
    section.append(text("h2", "mono section-title", group.g), createKindGrid(group.g, group.kinds));
    schemasPanel.append(section);
  }

  const sourcesPanel = createSourcesPanel(project);
  sourcesPanel.hidden = true;

  page.append(createViewTabs(schemasPanel, sourcesPanel), schemasPanel, sourcesPanel);
  return page;
}

function createProjectHero(index: CatalogIndex, project: ProjectEntry): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero";

  const title = document.createElement("h1");
  title.append(document.createTextNode(project.alias), createBadge(projectVersionLabel(project), "version-badge"));

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.append(createRepoLink(project.repo));

  const badges = document.createElement("div");
  badges.className = "meta-row";
  badges.append(createShield(CATEGORY_ICON, categoryName(index, project), "shield-category"));
  const cncfShield = project.cncf === undefined ? undefined : CNCF_SHIELDS[project.cncf];
  if (cncfShield !== undefined) {
    badges.append(createShield(CNCF_ICON, cncfShield.label, cncfShield.variant));
  }
  if (project.repo.startsWith("kubernetes-sigs/")) {
    badges.append(createShield(K8S_ICON, "Kubernetes SIG", "shield-k8s-sig"));
  }

  hero.append(
    title,
    meta,
    badges,
    text("p", "stats-line", `${kindCount(project)} kinds · ${schemaCount(project)} schemas · updated ${formatDate(project.builtAt)}`),
  );
  return hero;
}

/**
 * Builds the [Schemas | Sources] view tabs. Schemas leads with the kind grids;
 * Sources carries the per-source provenance. Reuses the catalog scope-tab
 * pill styling.
 */
function createViewTabs(schemasPanel: HTMLElement, sourcesPanel: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "catalog-scope project-tabs";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Project view");

  const views = [
    { label: "Schemas", panel: schemasPanel },
    { label: "Sources", panel: sourcesPanel },
  ];
  const buttons: HTMLButtonElement[] = [];
  const applyActive = (active: number): void => {
    views.forEach(({ panel }, i) => {
      panel.hidden = i !== active;
    });
    buttons.forEach((button, i) => {
      button.classList.toggle("active", i === active);
      button.setAttribute("aria-pressed", String(i === active));
    });
  };

  views.forEach(({ label }, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "catalog-scope-tab";
    button.textContent = label;
    button.addEventListener("click", () => applyActive(i));
    buttons.push(button);
    wrap.append(button);
  });
  applyActive(0);
  return wrap;
}

/**
 * Renders the Sources tab: one row per source with display alias, resolved
 * version, repository link, and build date. Grouped projects list their
 * members; single-source projects list themselves.
 */
function createSourcesPanel(project: ProjectEntry): HTMLElement {
  const sources: ProjectSourceEntry[] = project.sources ?? [
    {
      name: project.name,
      alias: project.alias,
      repo: project.repo,
      version: project.version ?? "",
      builtAt: project.builtAt,
    },
  ];

  const section = document.createElement("section");
  section.className = "group-section";
  const grid = document.createElement("div");
  grid.className = "project-sources";
  for (const member of sources) {
    const row = document.createElement("div");
    row.className = "project-source-row";
    const head = document.createElement("span");
    head.className = "project-source-name";
    head.append(document.createTextNode(member.alias), createBadge(member.version, "version-badge"));
    row.append(head, createRepoLink(member.repo), text("span", "project-source-date", `updated ${formatDate(member.builtAt)}`));
    grid.append(row);
  }
  section.append(grid);
  return section;
}

/**
 * Renders a group's kinds as a responsive grid cell per kind: the kind link
 * followed by its version chips, so version columns never zigzag down the page.
 */
function createKindGrid(group: string, kinds: KindEntry[]): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "kind-grid";
  for (const entry of kinds) {
    const latest = latestVersion(entry);
    const cell = document.createElement("div");
    cell.className = "kind-cell";
    cell.append(link(kindRoute(group, entry[0], latest), kindDisplay(entry), "kind-link mono"));

    const versions = document.createElement("span");
    versions.className = "version-list";
    entry[1].forEach((version, index) => {
      const chip = link(kindRoute(group, entry[0], version), version, "chip");
      if (!hasFields(entry, index)) {
        chip.classList.add("schema-only");
        chip.title = "schema only";
      }
      versions.append(chip);
    });
    cell.append(versions);
    grid.append(cell);
  }
  return grid;
}
