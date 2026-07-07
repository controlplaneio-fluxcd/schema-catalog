// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex, KindEntry, ProjectEntry } from "../shared/types.ts";
import { agentsRoute, cliRoute, homeRoute } from "./router.ts";
import { createThemeToggle } from "./theme.ts";

/** Repository behind the catalog, linked from the header and footer. */
export const REPO_URL = "https://github.com/controlplaneio-fluxcd/schema-catalog";

/** The flux-schema CLI repository, the CI half of the story. */
export const CLI_URL = "https://github.com/fluxcd/flux-schema";

const GITHUB_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>';

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

/**
 * Creates the sticky site header: brand, page nav (Catalog, AI Agents, CLI,
 * parent site), theme toggle, and the GitHub repository link. `active` marks
 * the current page's nav link.
 */
export function createSiteHeader(active: "catalog" | "agents" | "cli" | "" = ""): HTMLElement {
  const header = document.createElement("header");
  header.className = "site-header";

  const inner = document.createElement("div");
  inner.className = "site-header-inner";

  const brand = link(homeRoute(), "", "site-brand");
  const logo = document.createElement("img");
  logo.src = "/flux-operator-icon-color.svg";
  logo.alt = "";
  logo.width = 24;
  logo.height = 24;
  brand.append(logo, text("span", "", "Flux Schema"));

  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");

  const catalogLink = link(homeRoute(), "Catalog", "nav-link");
  if (active === "catalog") {
    catalogLink.classList.add("active");
  }
  const agentsLink = link(agentsRoute(), "AI Agents", "nav-link nav-link-ai");
  if (active === "agents") {
    agentsLink.classList.add("active");
  }
  const cliLink = link(cliRoute(), "CLI", "nav-link");
  if (active === "cli") {
    cliLink.classList.add("active");
  }
  const parentLink = externalNavLink("https://fluxoperator.dev", "Flux Operator");
  nav.append(catalogLink, agentsLink, cliLink, parentLink);

  const spacer = document.createElement("span");
  spacer.className = "header-spacer";

  const actions = document.createElement("div");
  actions.className = "header-actions";
  const github = link(REPO_URL, "", "icon-button");
  github.innerHTML = GITHUB_ICON;
  github.target = "_blank";
  github.rel = "noopener noreferrer";
  github.setAttribute("aria-label", "GitHub repository");
  github.title = "GitHub repository";
  actions.append(createThemeToggle(), github);

  inner.append(brand, nav, spacer, actions);
  header.append(inner);
  return header;
}

function externalNavLink(href: string, label: string): HTMLAnchorElement {
  const anchor = link(href, "", "nav-link");
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.append(document.createTextNode(label), text("span", "external-mark", "↗"));
  return anchor;
}

/**
 * Creates the shared multi-column site footer: brand and attribution, catalog
 * links, and parent-project links mirroring fluxoperator.dev's footer.
 */
export function createSiteFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";

  const inner = document.createElement("div");
  inner.className = "site-footer-inner";

  const content = document.createElement("div");
  content.className = "footer-content";

  const brand = document.createElement("div");
  brand.className = "footer-brand";
  const logoLink = link(homeRoute(), "", "footer-logo");
  const logo = document.createElement("img");
  logo.src = "/flux-operator-icon-color.svg";
  logo.alt = "";
  logo.width = 22;
  logo.height = 22;
  logoLink.append(logo, text("span", "", "Flux Schema Catalog"));
  brand.append(
    logoLink,
    text("p", "footer-tagline", "Kubernetes API schemas for AI agents and CI pipelines."),
    text("p", "footer-attribution", "Operated by the Flux Operator team at ControlPlane."),
  );

  content.append(
    brand,
    createFooterColumn("Catalog", [
      { label: "Browse projects", href: homeRoute() },
      { label: "AI agents", href: agentsRoute() },
      { label: "flux-schema CLI", href: cliRoute() },
      { label: "Report an issue", href: `${REPO_URL}/issues` },
    ]),
    createFooterColumn("Flux Operator", [
      { label: "Website", href: "https://fluxoperator.dev" },
      { label: "Documentation", href: "https://fluxoperator.dev/docs/" },
      { label: "Flux MCP Server", href: "https://fluxoperator.dev/mcp-server/" },
      { label: "Get started", href: "https://fluxoperator.dev/get-started/" },
    ]),
  );

  const bottom = document.createElement("div");
  bottom.className = "footer-bottom";
  const license = document.createElement("p");
  const licenseLink = link(`${REPO_URL}/blob/main/LICENSE`, "AGPL-3.0 license");
  licenseLink.target = "_blank";
  licenseLink.rel = "noopener noreferrer";
  license.append(document.createTextNode("Open source under the "), licenseLink, document.createTextNode("."));
  bottom.append(license, text("p", "", `© ${new Date().getFullYear()} Flux Operator Authors.`));

  inner.append(content, bottom);
  footer.append(inner);
  return footer;
}

function createFooterColumn(title: string, items: Array<{ label: string; href: string }>): HTMLElement {
  const column = document.createElement("div");
  column.className = "footer-column";
  column.append(text("h4", "", title));

  const list = document.createElement("ul");
  for (const item of items) {
    const entry = document.createElement("li");
    const anchor = link(item.href, item.label);
    if (item.href.startsWith("http")) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    entry.append(anchor);
    list.append(entry);
  }
  column.append(list);
  return column;
}

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

const CROSS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/** Creates an icon copy-to-clipboard button with transient success/failure feedback. */
export function createCopyButton(value: string, label: string, variantClass = ""): HTMLButtonElement {
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = variantClass === "" ? "copy-button" : `copy-button ${variantClass}`;
  copy.innerHTML = COPY_ICON;
  copy.setAttribute("aria-label", label);
  copy.title = label;
  copy.addEventListener("click", () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        copy.innerHTML = CHECK_ICON;
        copy.classList.add("copied");
        setTimeout(() => {
          copy.innerHTML = COPY_ICON;
          copy.classList.remove("copied");
        }, 1600);
      },
      () => {
        copy.innerHTML = CROSS_ICON;
      },
    );
  });
  return copy;
}

/** Languages understood by the lightweight code-block highlighter. */
export type CodeLang = "shell" | "json" | "yaml" | "console" | "none";

/** Creates a bordered pre/code block with light syntax highlighting and an icon copy button. */
export function createCodeBlock(code: string, lang: CodeLang = "shell"): HTMLElement {
  const block = document.createElement("div");
  block.className = "code-block";

  const pre = document.createElement("pre");
  const codeElement = document.createElement("code");
  appendHighlighted(codeElement, code, lang);
  pre.append(codeElement);

  block.append(pre, createCopyButton(code, "Copy to clipboard", "code-copy"));
  return block;
}

/**
 * Line-based token highlighting built from DOM spans, so untrusted text can
 * never become markup. Deliberately light: commands, flags, strings/URLs,
 * keys, and comments — enough to scan, not a grammar.
 */
function appendHighlighted(target: HTMLElement, code: string, lang: CodeLang): void {
  if (lang === "none") {
    target.textContent = code;
    return;
  }
  code.split("\n").forEach((line, index) => {
    if (index > 0) {
      target.append(document.createTextNode("\n"));
    }
    if (lang === "shell") {
      appendShellLine(target, line);
    } else if (lang === "json") {
      appendJsonLine(target, line);
    } else if (lang === "yaml") {
      appendYamlLine(target, line);
    } else {
      appendConsoleLine(target, line);
    }
  });
}

function tok(className: string, value: string): HTMLElement {
  return text("span", className, value);
}

function appendShellLine(target: HTMLElement, line: string): void {
  if (/^\s*#/.test(line)) {
    target.append(tok("tok-comment", line));
    return;
  }

  let cursor = 0;
  const command = /^(\s*)([A-Za-z][\w.-]*)(?=\s|$)/.exec(line);
  if (command !== null && !line.trimStart().startsWith("http")) {
    target.append(document.createTextNode(command[1] ?? ""), tok("tok-cmd", command[2] ?? ""));
    cursor = command[0].length;
  }

  // Flags must start at a word boundary so a dash inside a name
  // (flux-schema-catalog) is never mistaken for one.
  const pattern = /("[^"]*"|'[^']*')|(https?:\/\/[^\s\\]+)|((?<=^|\s)--?[A-Za-z][\w-]*)|(\|\s*)([A-Za-z][\w.-]*)/g;
  pattern.lastIndex = cursor;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    target.append(document.createTextNode(line.slice(cursor, match.index)));
    if (match[1] !== undefined || match[2] !== undefined) {
      target.append(tok("tok-str", match[0]));
    } else if (match[3] !== undefined) {
      target.append(tok("tok-flag", match[0]));
    } else {
      target.append(document.createTextNode(match[4] ?? ""), tok("tok-cmd", match[5] ?? ""));
    }
    cursor = pattern.lastIndex;
  }
  target.append(document.createTextNode(line.slice(cursor)));
}

function appendJsonLine(target: HTMLElement, line: string): void {
  const entry = /^(\s*)("[^"]*")(\s*:\s*)(.*)$/.exec(line);
  if (entry === null) {
    target.append(document.createTextNode(line));
    return;
  }
  target.append(document.createTextNode(entry[1] ?? ""), tok("tok-key", entry[2] ?? ""), document.createTextNode(entry[3] ?? ""));

  const value = entry[4] ?? "";
  const str = /^("[^"]*")(.*)$/.exec(value);
  if (str !== null) {
    target.append(tok("tok-str", str[1] ?? ""), document.createTextNode(str[2] ?? ""));
    return;
  }
  const scalar = /^(true|false|null|-?\d+(?:\.\d+)?)(.*)$/.exec(value);
  if (scalar !== null) {
    target.append(tok("tok-num", scalar[1] ?? ""), document.createTextNode(scalar[2] ?? ""));
    return;
  }
  target.append(document.createTextNode(value));
}

function appendYamlLine(target: HTMLElement, line: string): void {
  if (/^\s*#/.test(line)) {
    target.append(tok("tok-comment", line));
    return;
  }
  const urlItem = /^(\s*-\s*)(https?:\/\/\S+)(\s*)$/.exec(line);
  if (urlItem !== null) {
    target.append(
      document.createTextNode(urlItem[1] ?? ""),
      tok("tok-str", urlItem[2] ?? ""),
      document.createTextNode(urlItem[3] ?? ""),
    );
    return;
  }
  // The key colon must be followed by whitespace or end the line, so the
  // colon inside a URL (https://) never reads as a mapping key.
  const entry = /^(\s*-?\s*)([\w.-]+)(:)(?=\s|$)(.*)$/.exec(line);
  if (entry === null) {
    target.append(document.createTextNode(line));
    return;
  }
  target.append(document.createTextNode(entry[1] ?? ""), tok("tok-key", entry[2] ?? ""), document.createTextNode(entry[3] ?? ""));

  const value = entry[4] ?? "";
  const str = /^(\s*)("[^"]*"|'[^']*')(\s*)$/.exec(value);
  if (str !== null) {
    target.append(document.createTextNode(str[1] ?? ""), tok("tok-str", str[2] ?? ""), document.createTextNode(str[3] ?? ""));
    return;
  }
  target.append(document.createTextNode(value));
}

function appendConsoleLine(target: HTMLElement, line: string): void {
  if (line.startsWith("$ ")) {
    target.append(tok("tok-prompt", "$ "));
    appendShellLine(target, line.slice(2));
    return;
  }
  if (line.startsWith("Summary:")) {
    target.append(tok("tok-comment", line));
    return;
  }
  line.split(/(invalid)/).forEach((part) => {
    if (part === "invalid") {
      target.append(tok("tok-err", part));
    } else if (part !== "") {
      target.append(document.createTextNode(part));
    }
  });
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

/** Creates a repository link with the GitHub mark in front of the full host path. */
export function createRepoLink(repo: string): HTMLAnchorElement {
  const anchor = link(`https://github.com/${repo}`, "", "repo-link external-link");
  const icon = document.createElement("span");
  icon.className = "repo-icon";
  icon.innerHTML = GITHUB_ICON;
  icon.setAttribute("aria-hidden", "true");
  anchor.append(icon, document.createTextNode(`github.com/${repo}`));
  return anchor;
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
  page.append(createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "Not found" }]));

  const panel = document.createElement("section");
  panel.className = "empty-state";
  panel.append(text("h1", "", "Not found"), text("p", "", message));
  page.append(panel);
  return page;
}
