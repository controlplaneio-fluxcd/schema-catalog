// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Path-route union for the SPA. Project routes carry the source name, and kind
 * routes carry canonical group/kind/version segments that map to catalog object
 * paths.
 */
export type Route =
  | { name: "home" }
  | { name: "mcp" }
  | { name: "cli" }
  | { name: "project"; project: string }
  | { name: "kind"; group: string; kind: string; version: string }
  | { name: "not-found"; path: string };

let dispatch: ((route: Route) => void) | undefined;

/**
 * Installs the history router and immediately renders the current route.
 * Internal link clicks are intercepted and pushed onto the history stack;
 * links whose path does not parse to a known route (raw /catalog files,
 * external URLs, downloads) navigate normally. Legacy `#/...` hash URLs are
 * rewritten to their path equivalents before the first render. The returned
 * cleanup function removes the listeners for tests or future embedding.
 */
export function installRouter(render: (route: Route) => void): () => void {
  dispatch = render;
  const onNavigate = (): void => render(parseRoute(location.pathname));
  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (target === null || target.target !== "" || target.origin !== location.origin) {
      return;
    }
    if (parseRoute(target.pathname).name === "not-found") {
      return;
    }
    event.preventDefault();
    navigate(target.pathname);
  };

  addEventListener("popstate", onNavigate);
  document.addEventListener("click", onClick);

  if (location.hash.startsWith("#/")) {
    history.replaceState(null, "", location.hash.slice(1));
  }
  onNavigate();
  return () => {
    removeEventListener("popstate", onNavigate);
    document.removeEventListener("click", onClick);
    dispatch = undefined;
  };
}

/** Pushes a path onto the history stack and renders its route. */
export function navigate(path: string): void {
  if (path !== location.pathname) {
    history.pushState(null, "", path);
  }
  dispatch?.(parseRoute(path));
}

/** Returns the URL path for the catalog overview. */
export function homeRoute(): string {
  return "/";
}

/** Returns the URL path for the AI agents (MCP server) page. */
export function agentsRoute(): string {
  return "/agents";
}

/** Returns the URL path for the flux-schema CLI page. */
export function cliRoute(): string {
  return "/cli";
}

/** Returns the URL path for a project source name, URL-encoding the segment. */
export function projectRoute(project: string): string {
  return `/p/${encodeSegment(project)}`;
}

/** Returns the URL path for a concrete group/kind/version tuple. */
export function kindRoute(group: string, kind: string, version: string): string {
  return `/k/${encodeSegment(group)}/${encodeSegment(kind)}/${encodeSegment(version)}`;
}

/**
 * Parses a URL path into a route without throwing. A legacy `#`-prefixed hash
 * value is accepted too. Invalid percent-encoding or an unsupported path shape
 * returns `not-found` with the original path text.
 */
export function parseRoute(value: string): Route {
  const path = value.startsWith("#") ? value.slice(1) : value;
  if (path === "" || path === "/") {
    return { name: "home" };
  }

  const rawParts = path.replace(/^\/+/, "").split("/");
  let parts: string[];
  try {
    parts = rawParts.map((part) => decodeURIComponent(part));
  } catch {
    return { name: "not-found", path };
  }

  // "mcp-server" is the legacy alias for the agents page.
  if ((parts[0] === "agents" || parts[0] === "mcp-server") && parts.length === 1) {
    return { name: "mcp" };
  }

  if (parts[0] === "cli" && parts.length === 1) {
    return { name: "cli" };
  }

  if (parts[0] === "p" && parts.length === 2 && parts[1] !== undefined && parts[1] !== "") {
    return { name: "project", project: parts[1] };
  }

  if (
    parts[0] === "k" &&
    parts.length === 4 &&
    parts[1] !== undefined &&
    parts[1] !== "" &&
    parts[2] !== undefined &&
    parts[2] !== "" &&
    parts[3] !== undefined &&
    parts[3] !== ""
  ) {
    return { name: "kind", group: parts[1], kind: parts[2], version: parts[3] };
  }

  return { name: "not-found", path };
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}
