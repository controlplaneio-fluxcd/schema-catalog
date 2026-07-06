// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex } from "../shared/types.ts";
import { clear, createSiteFooter, createSiteHeader, notFoundView, text } from "./dom.ts";
import { installRouter, type Route } from "./router.ts";
import { initializeTheme } from "./theme.ts";
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
    if (location.hash !== "" && location.hash !== "#/") {
      location.hash = "#/";
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
  // Full-page re-render: reset the viewport so navigation reads as a page
  // change instead of landing mid-scroll.
  scrollTo(0, 0);
}

function navHighlight(route: Route): "catalog" | "agents" | "cli" | "" {
  if (route.name === "mcp") {
    return "agents";
  }
  if (route.name === "cli") {
    return "cli";
  }
  return route.name === "not-found" ? "" : "catalog";
}

function renderView(route: Route): HTMLElement {
  if (route.name === "home") {
    return renderHome(catalogIndex);
  }
  if (route.name === "mcp") {
    return renderMcp(catalogIndex);
  }
  if (route.name === "cli") {
    return renderCli(catalogIndex);
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
