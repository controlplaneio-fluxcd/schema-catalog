// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Hash-route union for the SPA. Project routes carry the source name, and kind
 * routes carry canonical group/kind/version segments that map to catalog object
 * paths.
 */
export type Route =
  | { name: "home" }
  | { name: "project"; project: string }
  | { name: "kind"; group: string; kind: string; version: string }
  | { name: "not-found"; path: string };

/**
 * Installs the hash router and immediately renders the current route. The
 * returned cleanup function removes the listener for tests or future embedding.
 */
export function installRouter(render: (route: Route) => void): () => void {
  const onHashChange = (): void => render(parseRoute(location.hash));
  addEventListener("hashchange", onHashChange);
  onHashChange();
  return () => removeEventListener("hashchange", onHashChange);
}

/** Returns the hash URL for the catalog overview. */
export function homeRoute(): string {
  return "#/";
}

/** Returns the hash URL for a project source name, URL-encoding the segment. */
export function projectRoute(project: string): string {
  return `#/p/${encodeSegment(project)}`;
}

/** Returns the hash URL for a concrete group/kind/version tuple. */
export function kindRoute(group: string, kind: string, version: string): string {
  return `#/k/${encodeSegment(group)}/${encodeSegment(kind)}/${encodeSegment(version)}`;
}

/**
 * Parses a hash into a route without throwing. Invalid percent-encoding or an
 * unsupported path shape returns `not-found` with the original path text.
 */
export function parseRoute(hash: string): Route {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
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
