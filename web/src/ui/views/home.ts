import { latestVersion, searchIndex } from "../../shared/index-query.ts";
import type { CatalogIndex, ProjectEntry } from "../../shared/types.ts";
import {
  clear,
  createBadge,
  createPage,
  createSiteHeader,
  kindCount,
  link,
  schemaCount,
  text,
} from "../dom.ts";
import { kindRoute, projectRoute } from "../router.ts";

let activeQuery = "";

/**
 * Renders the catalog landing page. The search input state is module-scoped so
 * navigating away and back preserves the user's last query during a SPA session.
 */
export function renderHome(index: CatalogIndex): HTMLElement {
  const page = createPage("home-page");
  const header = createSiteHeader();
  header.classList.add("home-header");

  const search = document.createElement("input");
  search.id = "search";
  search.name = "search";
  search.className = "search-input";
  search.type = "search";
  search.placeholder = "Search kinds, API groups, projects…";
  search.autocomplete = "off";
  search.autofocus = true;
  search.value = activeQuery;
  search.setAttribute("aria-label", "Search kinds, API groups, projects");
  header.append(search);

  const content = document.createElement("section");
  content.className = "home-content";
  page.append(header, content);

  const renderContent = (): void => {
    activeQuery = search.value;
    clear(content);
    if (activeQuery.trim() === "") {
      renderCatalogOverview(index, content);
      return;
    }
    renderSearchResults(index, activeQuery, content);
  };

  search.addEventListener("input", renderContent);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value !== "") {
      search.value = "";
      renderContent();
    }
  });

  renderContent();
  requestAnimationFrame(() => search.focus());
  return page;
}

function renderCatalogOverview(index: CatalogIndex, content: HTMLElement): void {
  const projects = index.projects.length;
  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);
  const schemas = index.projects.reduce((total, project) => total + schemaCount(project), 0);
  content.append(text("p", "stats-line", `${projects} projects · ${kinds} kinds · ${schemas} schemas`));

  for (let categoryIndex = 0; categoryIndex < index.categories.length; categoryIndex += 1) {
    const category = index.categories[categoryIndex];
    if (category === undefined) {
      continue;
    }

    const projectsForCategory = index.projects.filter((project) => project.cat === categoryIndex);
    if (projectsForCategory.length === 0) {
      continue;
    }

    const section = document.createElement("section");
    section.className = "category-section";
    section.append(text("h2", "section-title", category));

    const grid = document.createElement("div");
    grid.className = "project-grid";
    projectsForCategory.forEach((project) => grid.append(createProjectCard(project)));
    section.append(grid);
    content.append(section);
  }
}

function createProjectCard(project: ProjectEntry): HTMLAnchorElement {
  const card = link(projectRoute(project.name), "", "project-card");
  const header = document.createElement("span");
  header.className = "card-head";
  header.append(text("strong", "", project.alias), createBadge(project.version, "version-badge"));

  card.append(header, text("span", "muted", `${kindCount(project)} kinds`));
  return card;
}

function renderSearchResults(index: CatalogIndex, query: string, content: HTMLElement): void {
  const hits = searchIndex(index, query, 50);
  const list = document.createElement("div");
  list.className = "results-list";

  for (const hit of hits) {
    const version = latestVersion([hit.kind, hit.versions, hit.fieldsBits]);
    const row = link(kindRoute(hit.group, hit.kind, version), "", "result-row");
    row.append(
      text("strong", "result-kind", hit.kind),
      text("span", "muted", `— ${hit.group} —`),
      createBadge(hit.alias, "project-badge"),
    );
    list.append(row);
  }

  content.append(list);
  content.append(text("p", "results-footer", `${hits.length} result${hits.length === 1 ? "" : "s"}`));
}
