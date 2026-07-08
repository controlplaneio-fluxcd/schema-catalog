// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex, KindEntry, ProjectEntry } from "../shared/types.ts";
import { agentsRoute, catalogRoute, cliRoute, homeRoute } from "./router.ts";
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

/**
 * A titled page section whose heading links to its own `#<id>` anchor, so
 * every section is deep-linkable as `<path>#<id>`.
 */
export function createSection(title: string, id: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "mcp-section";
  section.id = id;
  const heading = document.createElement("h2");
  heading.append(link(`#${id}`, title, "section-anchor"));
  section.append(heading);
  return section;
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

  const catalogLink = link(catalogRoute(), "Catalog", "nav-link");
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
      { label: "Add project", href: `${REPO_URL}/issues/new?template=add-project.yaml`, external: true },
      { label: "Browse projects", href: catalogRoute() },
      { label: "Flux Schema MCP", href: agentsRoute() },
      { label: "Flux Schema CLI", href: cliRoute() },
    ]),
    createFooterColumn("Flux Operator", [
      { label: "Get started guide", href: "https://fluxoperator.dev/get-started/" },
      { label: "Documentation", href: "https://fluxoperator.dev/docs/" },
      { label: "Flux Web UI", href: "https://fluxoperator.dev/web-ui/" },
      { label: "Flux MCP Server", href: "https://fluxoperator.dev/mcp-server/" },
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

const EXTERNAL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

/** Creates the external-link icon mark for links that open off-site. */
export function createExternalIcon(): HTMLElement {
  const mark = text("span", "ext-icon", "");
  mark.innerHTML = EXTERNAL_ICON;
  mark.setAttribute("aria-hidden", "true");
  return mark;
}

function createFooterColumn(
  title: string,
  items: Array<{ label: string; href: string; external?: boolean }>,
): HTMLElement {
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
    if (item.external === true) {
      anchor.append(createExternalIcon());
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

/**
 * Creates the inline copy box: a bordered pill holding a monospace value and a
 * copy button, used for the MCP endpoint and the CLI install command. `variant`
 * tints the border to the page's accent — "ai" (violet) or "accent" (blue).
 * Passing `lang` runs the value through the same light highlighter as code
 * blocks so, for example, a shell command's first word reads as a command.
 */
export function createInlineCopy(
  value: string,
  copyLabel: string,
  variant: "ai" | "accent" = "accent",
  lang?: CodeLang,
): HTMLElement {
  const row = document.createElement("div");
  row.className = `inline-copy inline-copy-${variant}`;
  const code = document.createElement("code");
  if (lang === undefined) {
    code.textContent = value;
  } else {
    appendHighlighted(code, value, lang);
  }
  row.append(code, createCopyButton(value, copyLabel, ""));
  return row;
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

/** Award rosette marking CNCF projects. */
export const CNCF_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M20 2H4v2l5.81 4.36a7.004 7.004 0 0 0-4.46 8.84a6.996 6.996 0 0 0 8.84 4.46a7 7 0 0 0 0-13.3L20 4zm-5.06 17.5L12 17.78L9.06 19.5l.78-3.33l-2.59-2.24l3.41-.29L12 10.5l1.34 3.14l3.41.29l-2.59 2.24z"/></svg>';

/** Kubernetes wheel marking Kubernetes SIG projects. */
export const K8S_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M12.074 1.424a.638.638 0 0 0-.686.691v.173c.015.2.044.402.087.588c.058.358.085.73.07 1.102a.65.65 0 0 1-.201.33l-.014.258a7 7 0 0 0-1.117.17a7.9 7.9 0 0 0-4.012 2.292l-.213-.157a.56.56 0 0 1-.374-.042a6 6 0 0 1-.829-.747c-.129-.143-.26-.299-.403-.428l-.128-.1a.8.8 0 0 0-.431-.171c-.2 0-.372.07-.501.212c-.2.301-.127.675.16.904l.013.014c.03.029.087.072.115.1q.258.172.515.3c.33.186.631.403.918.647a.63.63 0 0 1 .114.358l.2.17a7.82 7.82 0 0 0-1.232 5.546l-.271.07a.84.84 0 0 1-.275.274c-.358.086-.73.17-1.102.17c-.186 0-.387 0-.588.057l-.156.03h-.014v.015c-.043 0-.086.014-.115.014a.62.62 0 0 0-.4.789a.625.625 0 0 0 .772.386a1 1 0 0 0 .188-.045c.186-.057.37-.127.528-.213a7.4 7.4 0 0 1 1.103-.316c.114 0 .244.057.33.129l.285-.042a8.04 8.04 0 0 0 3.54 4.426l-.1.258a.8.8 0 0 1 .044.358c-.143.344-.33.687-.56.987c-.114.172-.215.33-.344.501c0 .043.001.117-.056.16c-.014.043-.044.072-.059.114a.615.615 0 0 0 .372.787a.62.62 0 0 0 .79-.372c.028-.043.055-.143.083-.143c.072-.2.131-.387.174-.574a5.4 5.4 0 0 1 .473-1.102a.5.5 0 0 1 .271-.129l.143-.257c1.82.702 3.84.701 5.688.014l.115.23a.53.53 0 0 1 .3.198c.186.33.301.674.43 1.032c.043.187.102.373.174.588c.028 0 .055.086.084.129c.014.043.03.071.044.114a.61.61 0 0 0 .845.216a.614.614 0 0 0 .213-.845c-.014-.057-.056-.13-.056-.174c-.115-.157-.23-.329-.344-.486c-.215-.316-.371-.63-.543-.974a.48.48 0 0 1 .042-.372a1.2 1.2 0 0 1-.1-.244c1.661-1.002 2.951-2.577 3.539-4.454c.086.014.17.028.271.042c.086-.115.201-.115.33-.115c.387.057.73.16 1.103.302q.235.128.514.213c.058.014.116.03.202.03v.015c0 .014.058.013.1.028c.344.043.617-.202.689-.532a.617.617 0 0 0-.532-.7c-.057-.014-.127-.03-.17-.072h-.588a7 7 0 0 1-1.102-.202a.6.6 0 0 1-.274-.257l-.272-.07a7.8 7.8 0 0 0-1.262-5.531l.23-.2a.44.44 0 0 1 .114-.343c.273-.244.589-.46.918-.647a3.6 3.6 0 0 0 .5-.3a1 1 0 0 0 .13-.1c.043-.028.086-.058.086-.087c.258-.243.273-.63 0-.859c-.214-.257-.601-.257-.845 0c-.043 0-.1.059-.142.087a11 11 0 0 0-.403.428c-.244.272-.53.532-.831.747a.55.55 0 0 1-.372.042l-.23.171a7.98 7.98 0 0 0-5.098-2.462l-.014-.274a.5.5 0 0 1-.201-.314a5.6 5.6 0 0 1 .07-1.102a4 4 0 0 0 .087-.588v-.316a.62.62 0 0 0-.546-.548m-.842 4.773l-.174 3.223h-.014a.56.56 0 0 1-.114.302a.543.543 0 0 1-.745.13h-.014L7.536 7.973a6.23 6.23 0 0 1 3.035-1.662c.23-.043.446-.086.66-.115zm1.544 0a6.38 6.38 0 0 1 3.682 1.777L13.837 9.85h-.014a.66.66 0 0 1-.3.073a.535.535 0 0 1-.56-.518zm-6.2 2.938l2.406 2.19v.015c.086.071.157.16.157.274a.523.523 0 0 1-.372.657v.014l-3.095.89a6.4 6.4 0 0 1 .904-4.04m10.842.042c.73 1.189 1.032 2.595.932 3.984l-3.109-.89l-.014-.014a.5.5 0 0 1-.257-.17a.53.53 0 0 1 .056-.761l-.014-.042zm-5.915 2.322h.988l.615.758l-.215.96l-.887.431l-.887-.43l-.23-.96zm-2.308 2.65h.115c.243 0 .46.17.545.414c0 .1.001.23-.056.302v.042l-1.22 2.966a6.33 6.33 0 0 1-2.563-3.195zm5.274 0h.344l3.193.515a6.34 6.34 0 0 1-2.563 3.223l-1.234-3.022c-.115-.258.002-.558.26-.716m-2.521 1.298a.55.55 0 0 1 .529.277h.014l1.561 2.823a5 5 0 0 1-.615.171a6.4 6.4 0 0 1-3.481-.17l1.561-2.824h.014c.043-.1.115-.144.216-.215a.5.5 0 0 1 .201-.062"/></svg>';

export const CNCF_SHIELDS = {
  graduated: { label: "CNCF Graduated", variant: "shield-cncf" },
  incubating: { label: "CNCF Incubating", variant: "shield-cncf-incubating" },
  sandbox: { label: "CNCF Sandbox", variant: "shield-cncf-sandbox" },
} as const satisfies Record<NonNullable<ProjectEntry["cncf"]>, { label: string; variant: string }>;

/** Glyph leading the category shield across project and catalog surfaces. */
export const CATEGORY_ICON = "❖";

/**
 * Creates a two-tone split badge: a colored icon segment next to a tinted
 * label. Icons starting with `<svg` are trusted local markup; anything else
 * renders as text.
 */
export function createShield(icon: string, label: string, variant: string): HTMLElement {
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

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

/**
 * Creates a filter text field with a leading search icon: a `search-field`
 * wrapper holding the icon and a `filter-input` search box. Shared by the
 * catalog explorer and the kind-page fields filter so both read the same.
 */
export function createSearchField(options: {
  id: string;
  placeholder: string;
  ariaLabel: string;
  value?: string;
}): { field: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement("div");
  field.className = "search-field";

  const icon = text("span", "search-field-icon", "");
  icon.innerHTML = SEARCH_ICON;
  icon.setAttribute("aria-hidden", "true");

  const input = document.createElement("input");
  input.id = options.id;
  input.name = options.id;
  input.className = "filter-input search-field-input";
  input.type = "search";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = options.placeholder;
  input.setAttribute("aria-label", options.ariaLabel);
  if (options.value !== undefined) {
    input.value = options.value;
  }

  field.append(icon, input);
  return { field, input };
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
