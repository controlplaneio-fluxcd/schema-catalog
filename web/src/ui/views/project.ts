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
    section.append(text("h2", "mono section-title", group.g), createKindDirectory(group.g, group.kinds));
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
 * Renders the Sources tab as one card per source: alias with the release
 * version, the `owner/repo` path, and a `github:<sha> · synced <date>`
 * provenance line. A single-source project gets the same card without the
 * alias line (the hero already names it): the repo path moves up next to
 * the version badge.
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
  const list = document.createElement("div");
  list.className = "project-sources";
  for (const member of sources) {
    list.append(createSourceCard(member, sources.length > 1));
  }
  section.append(list);
  return section;
}

function externalLink(href: string, label: string, className = ""): HTMLAnchorElement {
  const anchor = link(href, label, className);
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function createReleaseLink(member: ProjectSourceEntry, className: string): HTMLAnchorElement {
  return externalLink(
    `https://github.com/${member.repo}/releases/tag/${encodeURIComponent(member.ref ?? member.version)}`,
    member.version,
    className,
  );
}

function createCommitLink(member: ProjectSourceEntry, sha: string): HTMLAnchorElement {
  // 7 chars displayed; the index's 12-char prefix stays in the commit URL.
  const commit = externalLink(`https://github.com/${member.repo}/commit/${sha}`, `github:${sha.slice(0, 7)}`);
  commit.title = sha;
  return commit;
}

/** Card for one source; `named` leads with the alias for grouped members. */
function createSourceCard(member: ProjectSourceEntry, named: boolean): HTMLElement {
  const card = document.createElement("div");
  card.className = "project-source-card";

  const head = document.createElement("div");
  head.className = "source-head";
  if (named) {
    head.append(text("span", "source-name", member.alias));
  } else {
    // The repo path takes the title slot when there is no alias line.
    // "source-stretch" grows the anchor over the whole card, so anywhere
    // outside the version and commit links opens the repository.
    head.append(externalLink(`https://github.com/${member.repo}`, member.repo, "source-name source-stretch mono"));
  }
  if (member.version !== "") {
    head.append(createReleaseLink(member, "badge version-badge"));
  }
  card.append(head);

  if (named) {
    const repo = document.createElement("p");
    repo.className = "source-repo";
    repo.append(externalLink(`https://github.com/${member.repo}`, member.repo, "source-stretch mono"));
    card.append(repo);
  }

  // Grouped members keep commit and sync date on one line; the lone card
  // spreads them over two.
  const synced = `synced ${formatDate(member.builtAt)}`;
  if (!named && member.sha !== undefined) {
    const commitLine = text("p", "source-meta", "");
    commitLine.append(createCommitLink(member, member.sha));
    card.append(commitLine, text("p", "source-meta", synced));
  } else {
    const meta = text("p", "source-meta", "");
    if (member.sha !== undefined) {
      meta.append(createCommitLink(member, member.sha), document.createTextNode(" · "));
    }
    meta.append(document.createTextNode(synced));
    card.append(meta);
  }
  return card;
}

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
      for (const row of section.querySelectorAll<HTMLElement>(".kind-row")) {
        const matches = groupMatches || (row.dataset["kind"] ?? "").includes(needle);
        row.hidden = !matches;
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
 * Renders a group's kinds as a hairline directory row per kind: the kind link
 * on the left is the row's only link and opens the preferred version; the
 * right side names that version as plain text (a link there would duplicate
 * the kind link's target) with a faint "+N" count when the kind page's
 * version switcher holds more. Columns adapt to the page width, so a
 * one-kind group is a single compact row, not a full-width hairline.
 */
function createKindDirectory(group: string, kinds: KindEntry[]): HTMLElement {
  const directory = document.createElement("div");
  directory.className = "kind-directory";
  for (const entry of kinds) {
    const row = document.createElement("div");
    row.className = "kind-row";
    // Match text for the kind filter: name plus the kubectl-style resource
    // aliases (plural, singular, short names), already lowercased.
    row.dataset["kind"] = resourceAliases(entry).join(" ");
    row.append(link(kindRoute(group, entry[0], latestVersion(entry)), kindDisplay(entry), "kind-link mono"));

    const version = text("span", "kind-version", latestVersion(entry));
    if (!hasFields(entry, 0)) {
      version.classList.add("schema-only");
      version.title = "schema only";
    }
    if (entry[1].length > 1) {
      version.append(text("span", "version-count", `+${entry[1].length - 1}`));
    }
    row.append(version);
    directory.append(row);
  }
  return directory;
}
