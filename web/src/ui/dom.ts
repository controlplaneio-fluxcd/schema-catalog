import type { CatalogIndex, KindEntry, ProjectEntry } from "../shared/types.ts";
import { homeRoute } from "./router.ts";
import { createThemeToggle } from "./theme.ts";

/** Removes all child nodes from an element before a view re-render. */
export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Creates an element with class text and text content set in one place. */
export function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  value: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

/** Creates an anchor with optional class text and plain-text label content. */
export function link(href: string, label: string, className = ""): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = label;
  if (className !== "") {
    anchor.className = className;
  }
  return anchor;
}

/** Creates a page root with the shared `page` class plus a view-specific class. */
export function createPage(className: string): HTMLElement {
  const page = document.createElement("main");
  page.className = `page ${className}`;
  return page;
}

/** Creates the reusable site header: logo lockup home link and theme toggle. */
export function createSiteHeader(title = "Flux Schema Catalog"): HTMLElement {
  const header = document.createElement("header");
  header.className = "site-header";

  const brand = link(homeRoute(), "", "site-brand");
  const logo = document.createElement("img");
  logo.src = "/flux-operator-icon-color.svg";
  logo.alt = "";
  logo.width = 22;
  logo.height = 22;
  brand.append(logo, document.createTextNode(title));

  const spacer = document.createElement("span");
  spacer.className = "header-spacer";
  header.append(brand, spacer, createThemeToggle());
  return header;
}

/** Creates an accessible breadcrumb nav from ordered labels and optional links. */
export function createBreadcrumb(items: Array<{ label: string; href?: string }>): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "breadcrumb";
  nav.setAttribute("aria-label", "Breadcrumb");

  items.forEach((item, index) => {
    if (index > 0) {
      nav.append(text("span", "breadcrumb-separator", "/"));
    }
    nav.append(item.href === undefined ? text("span", "", item.label) : link(item.href, item.label));
  });
  return nav;
}

/** Creates a span badge and appends any extra class text after the base class. */
export function createBadge(label: string, className = ""): HTMLElement {
  const badge = text("span", `badge${className === "" ? "" : ` ${className}`}`, label);
  return badge;
}

/** Resolves a project's category name from its compact category index. */
export function categoryName(index: CatalogIndex, project: ProjectEntry): string {
  return index.categories[project.cat] ?? "Uncategorized";
}

/** Counts distinct kinds in a project, not schema versions. */
export function kindCount(project: ProjectEntry): number {
  return project.groups.reduce((total, group) => total + group.kinds.length, 0);
}

/** Counts schema versions in a project by summing each kind's version list. */
export function schemaCount(project: ProjectEntry): number {
  return project.groups.reduce(
    (total, group) => total + group.kinds.reduce((sum, entry) => sum + entry[1].length, 0),
    0,
  );
}

/** Decodes whether the kind has a `.fields.txt` index at `versions[versionIndex]`. */
export function hasFields(entry: KindEntry, versionIndex: number): boolean {
  return (entry[2] & (1 << versionIndex)) !== 0;
}

/** Formats an ISO timestamp or date-like string as `YYYY-MM-DD` for UI badges. */
export function formatDate(value: string): string {
  return value.slice(0, 10);
}

/** Renders a consistent not-found page for missing routes, projects, or versions. */
export function notFoundView(message: string): HTMLElement {
  const page = createPage("not-found-page");
  page.append(createSiteHeader(), createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "Not found" }]));

  const panel = document.createElement("section");
  panel.className = "empty-state";
  panel.append(text("h1", "", "Not found"), text("p", "", message));
  page.append(panel);
  return page;
}
