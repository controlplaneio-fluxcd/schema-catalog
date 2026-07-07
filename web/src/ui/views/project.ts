// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { kindDisplay, latestVersion } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../../shared/types.ts";
import {
  categoryName,
  createBadge,
  createBreadcrumb,
  createPage,
  createRepoLink,
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
    createBreadcrumb([
      { label: "Home", href: homeRoute() },
      { label: project.alias },
    ]),
    createProjectHero(index, project),
  );

  for (const group of project.groups) {
    const section = document.createElement("section");
    section.className = "group-section";
    section.append(text("h2", "mono section-title", group.g), createKindGrid(group.g, group.kinds));
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
  meta.append(createRepoLink(project.repo));

  const badges = document.createElement("div");
  badges.className = "meta-row";
  badges.append(createShield("❖", categoryName(index, project), "shield-category"));
  if (project.cncf === "graduated") {
    badges.append(createShield(CNCF_ICON, "CNCF Graduated", "shield-cncf"));
  }

  hero.append(
    title,
    meta,
    badges,
    text("p", "stats-line", `${kindCount(project)} kinds · ${schemaCount(project)} schemas · updated ${formatDate(project.builtAt)}`),
  );
  return hero;
}

/** Award rosette marking CNCF graduated projects. */
const CNCF_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M20 2H4v2l5.81 4.36a7.004 7.004 0 0 0-4.46 8.84a6.996 6.996 0 0 0 8.84 4.46a7 7 0 0 0 0-13.3L20 4zm-5.06 17.5L12 17.78L9.06 19.5l.78-3.33l-2.59-2.24l3.41-.29L12 10.5l1.34 3.14l3.41.29l-2.59 2.24z"/></svg>';

/**
 * Creates a two-tone split badge: a colored icon segment next to a tinted
 * label. Icons starting with `<svg` are trusted local markup; anything else
 * renders as text.
 */
function createShield(icon: string, label: string, variant: string): HTMLElement {
  const shield = text("span", `shield ${variant}`, "");
  const glyph = text("span", "shield-icon", "");
  if (icon.startsWith("<svg")) {
    glyph.innerHTML = icon;
  } else {
    glyph.textContent = icon;
  }
  glyph.setAttribute("aria-hidden", "true");
  shield.append(glyph, text("span", "shield-label", label));
  return shield;
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
