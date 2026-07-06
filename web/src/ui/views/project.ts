// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { latestVersion } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../../shared/types.ts";
import {
  categoryName,
  createBadge,
  createBreadcrumb,
  createPage,
  createSiteHeader,
  formatDate,
  hasFields,
  kindCount,
  link,
  notFoundView,
  schemaCount,
  text,
} from "../dom.ts";
import { homeRoute, kindRoute } from "../router.ts";

/**
 * Renders one project page from the generated index. Missing project names
 * return a normal not-found view instead of throwing so hash routes stay
 * recoverable.
 */
export function renderProject(index: CatalogIndex, projectName: string): HTMLElement {
  const project = index.projects.find((candidate) => candidate.name === projectName);
  if (project === undefined) {
    return notFoundView(`Project "${projectName}" is not in this catalog index.`);
  }

  const page = createPage("project-page");
  page.append(
    createSiteHeader(),
    createBreadcrumb([
      { label: "Home", href: homeRoute() },
      { label: project.alias },
    ]),
    createProjectHero(index, project),
  );

  for (const group of project.groups) {
    const section = document.createElement("section");
    section.className = "group-section";
    section.append(text("h2", "mono section-title", group.g));

    const scroller = document.createElement("div");
    scroller.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "kind-table";
    table.append(createTableHead(), createTableBody(group.g, group.kinds));
    scroller.append(table);
    section.append(scroller);
    page.append(section);
  }

  return page;
}

function createProjectHero(index: CatalogIndex, project: ProjectEntry): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero";

  const title = document.createElement("h1");
  title.append(document.createTextNode(project.alias), createBadge(project.version, "version-badge"));

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.append(
    link(`https://github.com/${project.repo}`, project.repo, "external-link"),
    createBadge(categoryName(index, project), "category-badge"),
    text("span", "muted", `built ${formatDate(project.builtAt)}`),
  );

  hero.append(title, meta, text("p", "stats-line", `${kindCount(project)} kinds · ${schemaCount(project)} schemas`));
  return hero;
}

function createTableHead(): HTMLTableSectionElement {
  const thead = document.createElement("thead");
  const row = document.createElement("tr");
  row.append(text("th", "", "Kind"), text("th", "", "Versions"));
  thead.append(row);
  return thead;
}

function createTableBody(group: string, kinds: KindEntry[]): HTMLTableSectionElement {
  const tbody = document.createElement("tbody");
  for (const entry of kinds) {
    const latest = latestVersion(entry);
    const row = document.createElement("tr");
    const kindCell = document.createElement("td");
    kindCell.append(link(kindRoute(group, entry[0], latest), entry[0], "kind-link mono"));

    const versionsCell = document.createElement("td");
    versionsCell.className = "version-list";
    entry[1].forEach((version, index) => {
      const chip = link(kindRoute(group, entry[0], version), version, "chip");
      if (!hasFields(entry, index)) {
        chip.classList.add("schema-only");
        chip.title = "schema only";
      }
      versionsCell.append(chip);
    });

    row.append(kindCell, versionsCell);
    tbody.append(row);
  }
  return tbody;
}
