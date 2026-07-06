// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { latestVersion, searchIndex } from "../../shared/index-query.ts";
import type { SearchHit } from "../../shared/index-query.ts";
import type { CatalogIndex } from "../../shared/types.ts";
import { clear, kindCount, link, schemaCount, text } from "../dom.ts";
import { kindRoute, projectRoute } from "../router.ts";
import { createThemeToggle } from "../theme.ts";

const VALIDATE_COMMAND = "flux-schema validate <path> --schema-location https://schemas.fluxoperator.dev/catalog";

let activeQuery = "";

/**
 * Renders the search-first landing page: a centered oversized query field with
 * keyboard navigation (`/` focuses, arrows move, Enter opens), the copyable
 * validate command, and a quiet category-grouped browse index below the fold.
 */
export function renderHome(index: CatalogIndex): HTMLElement {
  const page = document.createElement("main");
  page.className = "page home-page";

  const top = document.createElement("div");
  top.className = "home-top";
  top.append(createThemeToggle());

  const hero = document.createElement("section");
  hero.className = "home-hero";

  const logo = document.createElement("img");
  logo.src = "/flux-operator-icon-color.svg";
  logo.alt = "";
  logo.className = "home-logo";
  logo.width = 60;
  logo.height = 60;

  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);
  const schemas = index.projects.reduce((total, project) => total + schemaCount(project), 0);

  const searchBox = document.createElement("div");
  searchBox.className = "home-search";

  const search = document.createElement("input");
  search.id = "search";
  search.name = "search";
  search.className = "search-input";
  search.type = "search";
  search.placeholder = `search ${kinds.toLocaleString("en-US")} kinds, groups, projects`;
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

  hero.append(
    logo,
    text("h1", "home-title", "Flux Schema Catalog"),
    text(
      "p",
      "home-tagline",
      `Schemas and field indexes for ${index.projects.length} Kubernetes projects`,
    ),
    searchBox,
  );

  const results = document.createElement("div");
  results.hidden = true;

  const browse = createBrowseIndex(index);

  const footer = document.createElement("footer");
  footer.className = "home-footer";
  footer.append(
    text("span", "", `${schemas.toLocaleString("en-US")} schemas`),
    link("https://github.com/controlplaneio-fluxcd/schema-catalog", "GitHub"),
    link("/mcp", "MCP endpoint"),
    link("https://fluxoperator.dev", "fluxoperator.dev"),
  );

  page.append(top, hero, results, createValidateLine(), browse, footer);

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
      browse.hidden = false;
      return;
    }

    const hits = searchIndex(index, query, 50);
    results.hidden = false;
    browse.hidden = true;
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
        location.hash = target.getAttribute("href")?.slice(1) ?? "";
      }
      return;
    }
    if (event.key === "Escape" && search.value !== "") {
      search.value = "";
      renderResults();
    }
  });

  renderResults();
  requestAnimationFrame(() => search.focus());
  return page;
}

function createResultRow(hit: SearchHit): HTMLAnchorElement {
  const version = latestVersion([hit.kind, hit.versions, hit.fieldsBits]);
  const row = link(kindRoute(hit.group, hit.kind, version), "", "result-row");
  row.append(
    text("span", "result-kind", hit.kind),
    text("span", "result-group", hit.group),
    text("span", "result-project", hit.alias),
  );
  return row;
}

function createValidateLine(): HTMLElement {
  const line = document.createElement("div");
  line.className = "validate-line";
  line.style.justifyContent = "center";

  const command = text("code", "validate-command", VALIDATE_COMMAND);
  command.title = VALIDATE_COMMAND;

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-button";
  copy.textContent = "Copy";
  copy.setAttribute("aria-label", "Copy validate command");
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(VALIDATE_COMMAND).then(
      () => {
        copy.textContent = "Copied";
        setTimeout(() => {
          copy.textContent = "Copy";
        }, 1600);
      },
      () => {
        copy.textContent = "Copy failed";
      },
    );
  });

  line.append(command, copy);
  return line;
}

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

    const section = document.createElement("section");
    section.className = "category-section";
    section.append(text("h3", "category-title", category));

    const flow = document.createElement("div");
    flow.className = "project-flow";
    for (const project of projects) {
      const item = link(projectRoute(project.name), "", "project-item");
      item.append(text("span", "", project.alias), text("span", "project-version", project.version));
      flow.append(item);
    }
    section.append(flow);
    browse.append(section);
  }

  return browse;
}

function createKbd(label: string): HTMLElement {
  const kbd = document.createElement("kbd");
  kbd.textContent = label;
  return kbd;
}
