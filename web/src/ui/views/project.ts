// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { hasFields, kindCount, kindDisplay, latestVersion, resourceAliases, schemaCount } from "../../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry, ProjectSourceEntry } from "../../shared/types.ts";
import {
  CATEGORY_ICON,
  categoryName,
  CNCF_ICON,
  CNCF_SHIELDS,
  createBreadcrumb,
  createPage,
  createProjectLogo,
  createRepoLink,
  createSearchField,
  createShield,
  formatDate,
  GITHUB_ICON,
  K8S_ICON,
  link,
  notFoundView,
  text,
} from "../dom.ts";
import { catalogCategoryRoute, catalogRoute, homeRoute, kindRoute } from "../router.ts";

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
      { label: "Catalog", href: catalogRoute() },
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
  if (kindCount(project) > KIND_FILTER_MIN) {
    schemasPanel.prepend(createKindFilter(project, schemasPanel));
  }

  const sourcesPanel = createSourcesPanel(project);
  sourcesPanel.hidden = true;

  page.append(createViewTabs(project, schemasPanel, sourcesPanel), schemasPanel, sourcesPanel);
  return page;
}

function createProjectHero(index: CatalogIndex, project: ProjectEntry): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero";

  const title = document.createElement("h1");
  title.append(document.createTextNode(project.alias));
  // The blue badge carries the release version only; grouped projects have no
  // single version, so they get no badge (the tab row carries the source count).
  if (project.version !== undefined) {
    title.append(createReleaseBadge(project.repo, project.version, project.ref));
  }

  const badges = document.createElement("div");
  badges.className = "meta-row";
  badges.append(
    createShield(CATEGORY_ICON, categoryName(index, project), "shield-category", catalogCategoryRoute(categoryName(index, project))),
  );
  let hasProvenance = false;
  const cncfShield = project.cncf === undefined ? undefined : CNCF_SHIELDS[project.cncf];
  if (cncfShield !== undefined) {
    // The CNCF landscape filtered to the project's maturity level.
    const cncfUrl = `https://landscape.cncf.io/?group=projects-and-products&view-mode=grid&project=${project.cncf}`;
    badges.append(createShield(CNCF_ICON, cncfShield.label, cncfShield.variant, cncfUrl));
    hasProvenance = true;
  }
  if (project.repo.startsWith("kubernetes-sigs/")) {
    badges.append(createShield(K8S_ICON, "Kubernetes SIG", "shield-k8s-sig", "https://github.com/kubernetes-sigs"));
    hasProvenance = true;
  }
  if (!hasProvenance) {
    // No foundation status: fall back to the GitHub org, as the catalog does.
    const org = project.repo.split("/")[0] ?? project.repo;
    badges.append(createShield(GITHUB_ICON, org, "shield-repo", `https://github.com/${org}`));
  }

  const logo = createProjectLogo(project);
  if (logo === null) {
    hero.append(title, badges);
  } else {
    const head = document.createElement("div");
    head.className = "hero-head";
    head.append(logo, title);
    hero.append(head, badges);
  }
  return hero;
}

/**
 * Builds the [Schemas | Source(s)] tab bar. Schemas leads with the kind grids;
 * the second tab carries the per-source provenance and names the source count
 * when the project groups several. The project stats sit at the right end of
 * the bar. The active tab is mirrored in the URL hash (`#sources`) so a tab
 * is linkable; Schemas is the default and carries no hash.
 */
function createViewTabs(project: ProjectEntry, schemasPanel: HTMLElement, sourcesPanel: HTMLElement): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "project-tabs";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Project view");

  const sourceCount = project.sources?.length ?? 1;
  const views = [
    { label: "Schemas", count: undefined, panel: schemasPanel },
    { label: sourceCount === 1 ? "Source" : "Sources", count: sourceCount === 1 ? undefined : sourceCount, panel: sourcesPanel },
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
  const writeTabUrl = (active: number): void => {
    const target = active === 1 ? `${location.pathname}#sources` : location.pathname;
    history.replaceState(history.state, "", target);
  };

  views.forEach(({ label, count }, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "project-tab";
    button.append(document.createTextNode(label));
    if (count !== undefined) {
      button.append(text("span", "project-tab-count", String(count)));
    }
    button.addEventListener("click", () => {
      applyActive(i);
      writeTabUrl(i);
    });
    buttons.push(button);
    wrap.append(button);
  });
  // `#source` is accepted too, matching the singular tab label.
  applyActive(/^#sources?$/.test(location.hash) ? 1 : 0);

  wrap.append(text("span", "project-tabs-stats", `${kindCount(project)} kinds · ${schemaCount(project)} schemas`));
  return wrap;
}

/**
 * Version badge linking to the source's GitHub release. The display version is
 * usually the tag itself; sources whose tags carry a project-name prefix
 * (`operator/v0.10.2`) ship the full ref separately, and the link must use it.
 */
function createReleaseBadge(repo: string, version: string, ref?: string): HTMLElement {
  const badge = link(
    `https://github.com/${repo}/releases/tag/${encodeURIComponent(ref ?? version)}`,
    version,
    "badge version-badge",
  );
  badge.target = "_blank";
  badge.rel = "noopener noreferrer";
  return badge;
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
      ...(project.ref === undefined ? {} : { ref: project.ref }),
      ...(project.sha === undefined ? {} : { sha: project.sha }),
      builtAt: project.builtAt,
    },
  ];

  const section = document.createElement("section");
  section.className = "group-section";
  const grid = document.createElement("div");
  // A lone source spans the full row instead of one auto-fill grid track.
  grid.className = sources.length === 1 ? "project-sources single" : "project-sources";
  for (const member of sources) {
    const row = document.createElement("div");
    row.className = "project-source-row";
    const head = document.createElement("span");
    head.className = "project-source-name";
    head.append(document.createTextNode(member.alias));
    if (member.version !== "") {
      head.append(createReleaseBadge(member.repo, member.version, member.ref));
    }
    const ref = member.ref ?? (member.version === "" ? undefined : member.version);
    const date = text("span", "project-source-date", `updated ${formatDate(member.builtAt)}`);
    if (member.sha !== undefined) {
      // 7 chars displayed; the index's 12-char prefix stays in the commit URL.
      const commit = link(`https://github.com/${member.repo}/commit/${member.sha}`, member.sha.slice(0, 7), "mono");
      commit.title = member.sha;
      commit.target = "_blank";
      commit.rel = "noopener noreferrer";
      date.append(document.createTextNode(" · "), commit);
    }
    row.append(head, createRepoLink(member.repo, ref), date);
    grid.append(row);
  }
  section.append(grid);
  return section;
}

/** Kinds with more versions than this collapse behind a "+N more" toggle. */
const VERSION_PREVIEW = 3;

/** Projects with more kinds than this get the kind filter toolbar. */
const KIND_FILTER_MIN = 20;

/**
 * Builds the kind filter toolbar for kind-heavy projects (the upjet providers
 * run to thousands of kinds): live substring filtering over kind and API group
 * names that hides non-matching kind cells and emptied group sections. A
 * matching group name keeps its whole group visible.
 */
function createKindFilter(project: ProjectEntry, panel: HTMLElement): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "fields-toolbar";

  const { field, input } = createSearchField({
    id: "kind-filter",
    placeholder: "Filter kinds",
    ariaLabel: "Filter kinds by name or API group",
  });
  const count = text("span", "fields-count", "");
  toolbar.append(field, count);

  const empty = text("p", "results-empty", "");
  empty.hidden = true;
  panel.prepend(empty);

  const total = kindCount(project);
  const apply = (): void => {
    const needle = input.value.trim().toLowerCase();
    let shown = 0;
    for (const section of panel.querySelectorAll<HTMLElement>(".group-section")) {
      const group = section.querySelector(".section-title")?.textContent ?? "";
      const groupMatches = needle === "" || group.toLowerCase().includes(needle);
      let visible = 0;
      for (const cell of section.querySelectorAll<HTMLElement>(".kind-cell")) {
        const matches = groupMatches || (cell.dataset["kind"] ?? "").includes(needle);
        cell.hidden = !matches;
        visible += matches ? 1 : 0;
      }
      section.hidden = visible === 0;
      shown += visible;
    }
    count.textContent = needle === "" ? "" : `${shown} of ${total} kinds`;
    empty.textContent = `Nothing matches "${input.value.trim()}". Try a kind or API group name.`;
    empty.hidden = shown !== 0;
  };

  input.addEventListener("input", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value !== "") {
      input.value = "";
      apply();
    }
  });
  return toolbar;
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
    // Match text for the kind filter: name plus the kubectl-style resource
    // aliases (plural, singular, short names), already lowercased.
    cell.dataset["kind"] = resourceAliases(entry).join(" ");
    cell.append(
      link(kindRoute(group, entry[0], latest), kindDisplay(entry), "kind-link mono"),
      createVersionList(group, entry),
    );
    grid.append(cell);
  }
  return grid;
}

/**
 * Renders a kind's version chips. Kinds with more versions than the preview
 * (Azure Service Operator ships a dozen per kind) show only the preferred
 * version plus a "+N more" toggle that expands the rest in place; the kind
 * page keeps the full version switcher either way.
 */
function createVersionList(group: string, entry: KindEntry): HTMLElement {
  const versions = document.createElement("span");
  versions.className = "version-list";
  const chipAt = (version: string, index: number): HTMLAnchorElement => {
    const chip = link(kindRoute(group, entry[0], version), version, "chip");
    if (!hasFields(entry, index)) {
      chip.classList.add("schema-only");
      chip.title = "schema only";
    }
    return chip;
  };

  const shown = entry[1].length > VERSION_PREVIEW ? 1 : entry[1].length;
  entry[1].slice(0, shown).forEach((version, index) => versions.append(chipAt(version, index)));

  const rest = entry[1].length - shown;
  if (rest > 0) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "flow-toggle";
    more.textContent = `+${rest} more`;
    more.setAttribute("aria-label", `Show ${rest} more versions`);
    more.addEventListener("click", () => {
      more.replaceWith(...entry[1].slice(shown).map((version, index) => chipAt(version, shown + index)));
    });
    versions.append(more);
  }
  return versions;
}
