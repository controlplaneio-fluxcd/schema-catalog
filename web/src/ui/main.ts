// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { findKind, kindDisplay } from "../shared/index-query.ts";
import type { CatalogIndex } from "../shared/types.ts";
import { clear, createSiteFooter, createSiteHeader, notFoundView, text } from "./dom.ts";
import { installRouter, navigate, type Route } from "./router.ts";
import { initializeTheme } from "./theme.ts";
import { renderCatalog } from "./views/catalog.ts";
import { renderCli } from "./views/cli.ts";
import { renderHome } from "./views/home.ts";
import { renderKind } from "./views/kind.ts";
import { renderMcp } from "./views/mcp.ts";
import { renderProject } from "./views/project.ts";

let catalogIndex: CatalogIndex;

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("missing #app element");
}
const appElement = app;

initializeTheme();
installSearchShortcut();

try {
  catalogIndex = await fetchCatalogIndex();
  installRouter(renderRoute);
} catch (error) {
  renderStartupError(error);
}

/** `/` focuses the home search from anywhere, unless already typing in a field. */
function installSearchShortcut(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    event.preventDefault();
    if (location.pathname !== "/") {
      navigate("/");
    }
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#search")?.focus());
  });
}

async function fetchCatalogIndex(): Promise<CatalogIndex> {
  const response = await fetch("/index.json");
  if (!response.ok) {
    throw new Error(`failed to fetch /index.json: ${response.status} ${response.statusText}`.trim());
  }
  return (await response.json()) as CatalogIndex;
}

function renderRoute(route: Route): void {
  clear(appElement);
  appElement.append(createSiteHeader(navHighlight(route)), renderView(route), createSiteFooter());
  document.title = titleFor(route);
  // Full-page re-render: land on the URL's anchor target when it has one,
  // else reset the viewport so navigation reads as a page change.
  const anchor = location.hash.length > 1 ? document.getElementById(location.hash.slice(1)) : null;
  if (anchor === null) {
    scrollTo(0, 0);
  } else {
    anchor.scrollIntoView();
  }
}

function titleFor(route: Route): string {
  if (route.name === "catalog") {
    return "Flux Schema Catalog: Kubernetes and CNCF schemas";
  }
  if (route.name === "mcp") {
    return "Flux Schema MCP Server · AI agents";
  }
  if (route.name === "cli") {
    return "Flux Schema CLI · validate and explain";
  }
  if (route.name === "project") {
    const project =
      catalogIndex.projects.find((candidate) => candidate.name === route.project) ??
      catalogIndex.projects.find((candidate) => candidate.sources?.some((member) => member.name === route.project));
    return `${project?.alias ?? route.project} · Flux Schema Catalog`;
  }
  if (route.name === "kind") {
    const found = findKind(catalogIndex, route.group, route.kind);
    const display = found === undefined ? route.kind : kindDisplay(found.entry);
    return `${display} ${route.group}/${route.version} · Flux Schema Catalog`;
  }
  return "Flux Schema Catalog: Kubernetes schemas for AI agents and CI pipelines";
}

function navHighlight(route: Route): "catalog" | "agents" | "cli" | "" {
  if (route.name === "mcp") {
    return "agents";
  }
  if (route.name === "cli") {
    return "cli";
  }
  // The catalog nav points at /catalog, so only the explorer and the project
  // and kind pages under it light up; the home page is reached via the brand.
  if (route.name === "catalog" || route.name === "project" || route.name === "kind") {
    return "catalog";
  }
  return "";
}

function renderView(route: Route): HTMLElement {
  if (route.name === "home") {
    return renderHome(catalogIndex);
  }
  if (route.name === "catalog") {
    return renderCatalog(catalogIndex);
  }
  if (route.name === "mcp") {
    return renderMcp(catalogIndex);
  }
  if (route.name === "cli") {
    return renderCli();
  }
  if (route.name === "project") {
    return renderProject(catalogIndex, route.project);
  }
  if (route.name === "kind") {
    return renderKind(catalogIndex, route.group, route.kind, route.version);
  }
  return notFoundView(`Route "${route.path}" is not recognized.`);
}

function renderStartupError(error: unknown): void {
  clear(appElement);
  const main = document.createElement("main");
  main.className = "page";
  main.append(
    text("h1", "", "Flux Schema Catalog"),
    text("p", "error-text", error instanceof Error ? error.message : String(error)),
  );
  appElement.append(main);
}
