// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { latestVersion, searchIndex } from "../../shared/index-query.ts";
import type { SearchHit } from "../../shared/index-query.ts";
import type { CatalogIndex, ProjectEntry } from "../../shared/types.ts";
import { clear, createCodeBlock, kindCount, link, REPO_URL, schemaCount, text } from "../dom.ts";
import { agentsRoute, cliRoute, kindRoute, navigate, projectRoute } from "../router.ts";

const MCP_CONFIG = `{
  "mcpServers": {
    "flux-schema-catalog": {
      "type": "http",
      "url": "https://schemas.fluxoperator.dev/mcp"
    }
  }
}`;

const VALIDATE_COMMAND = "flux schema validate ./manifests -s ecosystem";

const EXPLAIN_COMMAND = "flux schema explain -s ecosystem hr.spec.dependsOn";

/** Kinds cycled through the search placeholder; only ones present in the index show. */
const PLACEHOLDER_KINDS = ["HelmRelease", "Ingress", "Certificate", "CiliumNetworkPolicy", "Kustomization", "HTTPRoute"];

let activeQuery = "";

/**
 * Renders the landing page: hero with the oversized search (the primary
 * action), catalog stats, the AI/CI lanes (AI first, deliberately), and the
 * category-grouped browse index. Search keeps keyboard navigation: `/`
 * focuses, arrows move, Enter opens.
 */
export function renderHome(index: CatalogIndex): HTMLElement {
  const main = document.createElement("main");
  main.className = "home-main";

  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);
  const schemas = index.projects.reduce((total, project) => total + schemaCount(project), 0);

  const hero = document.createElement("section");
  hero.className = "home-hero";

  const badge = document.createElement("p");
  badge.className = "hero-badge";
  const dot = document.createElement("span");
  dot.className = "badge-dot";
  dot.setAttribute("aria-hidden", "true");
  badge.append(dot, document.createTextNode("Kubernetes · OpenShift · CNCF Ecosystem"));

  const title = document.createElement("h1");
  title.className = "home-title";
  title.append(
    document.createTextNode("Kubernetes schemas for"),
    document.createElement("br"),
    text("span", "gradient-text", "AI agents"),
    document.createTextNode(" and CI pipelines"),
  );

  const searchBox = document.createElement("div");
  searchBox.className = "home-search";

  const search = document.createElement("input");
  search.id = "search";
  search.name = "search";
  search.className = "search-input";
  search.type = "search";
  search.autocomplete = "off";
  search.spellcheck = false;
  search.value = activeQuery;
  search.setAttribute("aria-label", "Search kinds, API groups, projects");

  const glyph = text("span", "search-glyph", "❯");
  glyph.setAttribute("aria-hidden", "true");
  const kbdHint = document.createElement("span");
  kbdHint.className = "search-kbd";
  kbdHint.setAttribute("aria-hidden", "true");
  kbdHint.append(createKbd("/"));
  searchBox.append(glyph, search, kbdHint);

  installPlaceholder(search, index, kinds);

  const results = document.createElement("div");
  results.hidden = true;

  hero.append(
    badge,
    title,
    text(
      "p",
      "home-tagline",
      "An LLM-friendly kubectl explain for the CNCF Ecosystem, from Kubernetes core to the newest CRDs, extracted from upstream releases, rebuilt daily.",
    ),
    searchBox,
    results,
    createStats(index.projects.length, kinds, schemas),
  );

  const browse = createBrowseIndex(index);
  main.append(hero, createLanes(), browse, createRequestPanel());

  let selected = -1;
  let rows: HTMLAnchorElement[] = [];

  const renderResults = (): void => {
    activeQuery = search.value;
    selected = -1;
    rows = [];
    clear(results);

    const query = activeQuery.trim();
    if (query === "") {
      results.hidden = true;
      results.removeAttribute("class");
      return;
    }

    const hits = searchIndex(index, query, 50);
    results.hidden = false;
    results.className = "search-results";

    if (hits.length === 0) {
      results.append(text("p", "results-empty", `Nothing matches "${query}". Try a kind or API group name.`));
      return;
    }

    for (const hit of hits) {
      rows.push(createResultRow(hit));
    }
    results.append(...rows);

    const footerRow = document.createElement("p");
    footerRow.className = "results-footer";
    footerRow.append(
      text("span", "", `${hits.length} result${hits.length === 1 ? "" : "s"}`),
      text("span", "", "↑↓ to navigate · Enter to open"),
    );
    results.append(footerRow);
  };

  const moveSelection = (delta: number): void => {
    if (rows.length === 0) {
      return;
    }
    if (selected >= 0 && selected < rows.length) {
      rows[selected]?.classList.remove("selected");
    }
    selected = (selected + delta + rows.length) % rows.length;
    const row = rows[selected];
    if (row !== undefined) {
      row.classList.add("selected");
      row.scrollIntoView({ block: "nearest" });
    }
  };

  search.addEventListener("input", renderResults);
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
      return;
    }
    if (event.key === "Enter") {
      const target = rows[selected] ?? rows[0];
      if (target !== undefined) {
        navigate(target.pathname);
      }
      return;
    }
    if (event.key === "Escape" && search.value !== "") {
      search.value = "";
      renderResults();
    }
  });

  renderResults();
  // Autofocus only for keyboard/mouse setups; on touch it pops the keyboard
  // over the hero.
  if (matchMedia("(pointer: fine)").matches) {
    requestAnimationFrame(() => search.focus());
  }
  return main;
}

/**
 * Cycles real catalog kinds through the placeholder so the search advertises
 * actual content. Static under reduced motion, stops once the user types.
 */
function installPlaceholder(search: HTMLInputElement, index: CatalogIndex, kinds: number): void {
  const total = kinds.toLocaleString("en-US");
  const samples = PLACEHOLDER_KINDS.filter((kind) => searchIndex(index, kind, 1).length > 0);
  const fallback = `Search ${total} kinds, API groups, projects`;

  if (samples.length === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    search.placeholder = fallback;
    return;
  }

  let position = 0;
  search.placeholder = `Search ${total} kinds: try ${samples[0]}`;
  const timer = setInterval(() => {
    if (!search.isConnected) {
      clearInterval(timer);
      return;
    }
    if (search.value !== "" || document.activeElement === search) {
      return;
    }
    position = (position + 1) % samples.length;
    search.placeholder = `Search ${total} kinds: try ${samples[position]}`;
  }, 3200);
}

function createStats(projects: number, kinds: number, schemas: number): HTMLElement {
  const stats = document.createElement("div");
  stats.className = "hero-stats";

  const entries: Array<[string, string]> = [
    [projects.toLocaleString("en-US"), "projects"],
    [kinds.toLocaleString("en-US"), "kinds"],
    [schemas.toLocaleString("en-US"), "schemas"],
  ];

  entries.forEach(([value, label], position) => {
    if (position > 0) {
      const divider = document.createElement("span");
      divider.className = "stat-divider";
      stats.append(divider);
    }
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.append(text("span", "stat-value", value), text("span", "stat-label", label));
    stats.append(stat);
  });
  return stats;
}

/** The three audiences, in priority order: AI agents, CI pipelines, humans. */
function createLanes(): HTMLElement {
  const section = document.createElement("section");
  section.className = "home-lanes";

  const inner = document.createElement("div");
  inner.className = "lanes-inner";

  const ai = document.createElement("article");
  ai.className = "lane lane-ai";
  const aiLink = link(agentsRoute(), "Set up your agent →", "lane-link");
  const aiText = document.createElement("div");
  aiText.className = "lane-text";
  aiText.append(
    text("p", "lane-eyebrow", "For AI agents"),
    text("h2", "", "Give your agent ground truth"),
    text(
      "p",
      "",
      "Connect any MCP client and your agent stops guessing YAML: it greps the real fields, types, and constraints for the exact API version it writes or reviews, no cluster required.",
    ),
    aiLink,
  );
  ai.append(aiText, createCodeBlock(MCP_CONFIG, "json"));

  const ci = document.createElement("article");
  ci.className = "lane";
  const ciLink = link(cliRoute(), "Use it in CI →", "lane-link");
  ci.append(
    text("p", "lane-eyebrow", "For CI pipelines"),
    text("h2", "", "Validate before the cluster does"),
    text(
      "p",
      "",
      "Validate manifests against the same catalog: strict schemas catch missing, unknown, or deprecated fields, and CEL rules catch cross-field errors — before anything reaches a cluster.",
    ),
    createCodeBlock(VALIDATE_COMMAND),
    ciLink,
  );

  const humans = document.createElement("article");
  humans.className = "lane";
  const humansLink = link(`${cliRoute()}#explain`, "Explain from your terminal →", "lane-link");
  humans.append(
    text("p", "lane-eyebrow", "For developers"),
    text("h2", "", "Explain without a cluster"),
    text(
      "p",
      "",
      "Field docs, types, and constraints for the whole ecosystem, straight from your terminal: kinds, plural names, and short names like hr resolve with no kubeconfig in sight.",
    ),
    createCodeBlock(EXPLAIN_COMMAND),
    humansLink,
  );

  inner.append(ai, ci, humans);
  section.append(inner);
  return section;
}

function createResultRow(hit: SearchHit): HTMLAnchorElement {
  const version = latestVersion([hit.kind, hit.versions, hit.fieldsBits]);
  const row = link(kindRoute(hit.group, hit.kind, version), "", "result-row");
  row.append(
    text("span", "result-kind", hit.display),
    text("span", "result-group", hit.group),
    text("span", "result-project", hit.alias),
  );
  return row;
}

/** How many projects each category previews before its "+N more" expander. */
const CATEGORY_PREVIEW = 5;

/** Category indexes left open by their expander; survives view re-renders. */
const expandedCategories = new Set<number>();

/**
 * Renders the browse index: one section per CNCF category showing its project
 * count, a five-project preview, and a "+N more" expander for the rest, so
 * every category is visible without the page becoming a wall of names.
 */
function createBrowseIndex(index: CatalogIndex): HTMLElement {
  const browse = document.createElement("section");
  browse.className = "home-browse";
  browse.append(text("h2", "browse-rule", "Browse the catalog"));

  for (let categoryIndex = 0; categoryIndex < index.categories.length; categoryIndex += 1) {
    const category = index.categories[categoryIndex];
    if (category === undefined) {
      continue;
    }
    const projects = index.projects.filter((project) => project.cat === categoryIndex);
    if (projects.length === 0) {
      continue;
    }
    browse.append(createCategorySection(category, categoryIndex, projects));
  }

  return browse;
}

function createCategorySection(category: string, categoryIndex: number, projects: ProjectEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "category-section";

  const title = text("h3", "category-title", category);
  title.append(text("span", "category-count", String(projects.length)));
  section.append(title);

  // Pinned projects lead in their configured order (`pin` in sources.yaml);
  // the rest keep their alphabetical order after them.
  const ordered = [...projects].sort(
    (a, b) => (a.pin ?? Number.MAX_SAFE_INTEGER) - (b.pin ?? Number.MAX_SAFE_INTEGER),
  );

  const expanded = expandedCategories.has(categoryIndex);
  const flow = document.createElement("div");
  flow.className = "project-flow";
  for (const project of expanded ? ordered : ordered.slice(0, CATEGORY_PREVIEW)) {
    const item = link(projectRoute(project.name), "", "project-item");
    item.append(text("span", "", project.alias), text("span", "project-version", project.version));
    flow.append(item);
  }

  const hidden = ordered.length - CATEGORY_PREVIEW;
  if (hidden > 0) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "flow-toggle";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Show less" : `+${hidden} more`;
    toggle.addEventListener("click", () => {
      if (expanded) {
        expandedCategories.delete(categoryIndex);
      } else {
        expandedCategories.add(categoryIndex);
      }
      section.replaceWith(createCategorySection(category, categoryIndex, projects));
    });
    flow.append(toggle);
  }

  section.append(flow);
  return section;
}

/** Invites catalog additions; the button opens the add-project issue form. */
function createRequestPanel(): HTMLElement {
  const section = document.createElement("section");
  section.className = "home-request";

  const panel = document.createElement("div");
  panel.className = "request-panel";
  const button = link(
    `${REPO_URL}/issues/new?template=add-project.yaml`,
    "Request a project →",
    "button-link",
  );
  button.target = "_blank";
  button.rel = "noopener noreferrer";
  const copy = document.createElement("div");
  copy.className = "request-copy";
  copy.append(
    text("h2", "", "Missing a project?"),
    text("p", "", "Open an issue and its schemas will ship with the daily build."),
  );
  panel.append(copy, button);

  section.append(panel);
  return section;
}

function createKbd(label: string): HTMLElement {
  const kbd = document.createElement("kbd");
  kbd.textContent = label;
  return kbd;
}
