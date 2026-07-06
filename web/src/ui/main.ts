import type { CatalogIndex } from "../shared/types.ts";
import { clear, notFoundView, text } from "./dom.ts";
import { installRouter, type Route } from "./router.ts";
import { initializeTheme } from "./theme.ts";
import { renderHome } from "./views/home.ts";
import { renderKind } from "./views/kind.ts";
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
  if (route.name === "home") {
    appElement.append(renderHome(catalogIndex));
    return;
  }
  if (route.name === "project") {
    appElement.append(renderProject(catalogIndex, route.project));
    return;
  }
  if (route.name === "kind") {
    appElement.append(renderKind(catalogIndex, route.group, route.kind, route.version));
    return;
  }
  appElement.append(notFoundView(`Route "${route.path}" is not recognized.`));
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
