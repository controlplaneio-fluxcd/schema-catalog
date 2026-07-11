// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { findKind, kindCount, kindDisplay, kindSource } from "../shared/index-query.ts";
import type { CatalogIndex, GroupEntry, KindEntry, ProjectEntry } from "../shared/types.ts";
import type { Env } from "./index.ts";
import { loadIndex } from "./index-data.ts";

export const CANONICAL_ORIGIN = "https://schemas.fluxoperator.dev";

export type PageRoute =
  | { type: "project"; project: string }
  | { type: "kind"; group: string; kind: string; version: string };

export interface PageMeta {
  title: string;
  description: string;
  url: string;
}

/**
 * Parses only the history-routed UI pages that need server-side social metadata:
 * `/p/<project>/` and `/k/<group>/<kind>/<version>/`. The canonical form has a
 * trailing slash, but the bare form is accepted too (the router 301s it before
 * this runs; direct callers stay tolerant).
 */
export function parsePagePath(pathname: string): PageRoute | undefined {
  const rawSegments = pathname.replace(/\/+$/, "").split("/");
  if (rawSegments[0] !== "") {
    return undefined;
  }

  const segments: string[] = [];
  for (const raw of rawSegments.slice(1)) {
    if (raw === "") {
      return undefined;
    }
    try {
      segments.push(decodeURIComponent(raw));
    } catch {
      return undefined;
    }
  }

  if (segments[0] === "p" && segments.length === 2) {
    return { type: "project", project: segments[1]! };
  }

  if (segments[0] === "k" && segments.length === 4) {
    return { type: "kind", group: segments[1]!, kind: segments[2]!, version: segments[3]! };
  }

  return undefined;
}

/**
 * 301s a non-canonical page path (bare or multi-slash) to the trailing-slash
 * form, keeping the query string; returns undefined when the path is already
 * canonical or the method is not GET/HEAD. The Location carries no fragment,
 * so browsers re-attach the original one and `/p/kubernetes#sources` still
 * lands on the sources tab.
 */
export function redirectToCanonicalSlash(req: Request): Response | undefined {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return undefined;
  }
  const url = new URL(req.url);
  const canonical = `${url.pathname.replace(/\/+$/, "")}/`;
  if (url.pathname === canonical) {
    return undefined;
  }
  url.pathname = canonical;
  return Response.redirect(url.href, 301);
}

export function buildCanonicalPath(route: PageRoute): string {
  if (route.type === "project") {
    return `/p/${encodeURIComponent(route.project)}/`;
  }
  return `/k/${encodeURIComponent(route.group)}/${encodeURIComponent(route.kind)}/${encodeURIComponent(route.version)}/`;
}

export function buildProjectPageMeta(project: ProjectEntry): Omit<PageMeta, "url"> {
  const count = kindCount(project);
  const crd = count === 1 ? "CRD" : "CRDs";
  return {
    title: `${project.alias} | Flux Schema Catalog`,
    description: `JSON Schemas with LLM-optimized indexes for ${count} ${project.alias} ${crd}, extracted from upstream releases and rebuilt daily.`,
  };
}

export function buildKindPageMeta(
  project: ProjectEntry,
  group: GroupEntry,
  entry: KindEntry,
  version: string,
): Omit<PageMeta, "url"> {
  const display = kindDisplay(entry);
  const source = kindSource(project, group, entry) ?? project;
  const sourceVersion = source.version;
  const hasSourceVersion = sourceVersion !== undefined && sourceVersion !== "";
  const sourceText = hasSourceVersion ? `${source.alias} ${sourceVersion}` : "upstream releases";

  return {
    title: `${display} (${group.g}/${version}) | Flux Schema Catalog`,
    description:
      !hasSourceVersion
        ? `JSON Schema with LLM-optimized field index for ${display}, extracted from upstream releases and rebuilt daily.`
        : `JSON Schema with LLM-optimized field index for ${display}, extracted from ${sourceText} and rebuilt daily.`,
  };
}

export function buildPageMeta(index: CatalogIndex, route: PageRoute): PageMeta | undefined {
  const path = buildCanonicalPath(route);

  if (route.type === "project") {
    const project = index.projects.find((candidate) => candidate.name === route.project);
    if (project === undefined) {
      return undefined;
    }
    return { ...buildProjectPageMeta(project), url: `${CANONICAL_ORIGIN}${path}` };
  }

  const hit = findKind(index, route.group, route.kind);
  if (hit === undefined || !hit.entry[1].includes(route.version)) {
    return undefined;
  }
  return { ...buildKindPageMeta(hit.project, hit.group, hit.entry, route.version), url: `${CANONICAL_ORIGIN}${path}` };
}

export function rewritePageTags(shell: string, meta: PageMeta): string {
  const title = htmlEscape(meta.title);
  const description = htmlEscape(meta.description);
  const url = htmlEscape(meta.url);

  return shell
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
}

export async function servePage(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  cache: Cache = caches.default,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return env.ASSETS.fetch(req);
  }

  const route = parsePagePath(new URL(req.url).pathname);
  if (route === undefined) {
    return env.ASSETS.fetch(req);
  }

  const canonicalPath = buildCanonicalPath(route);
  const cacheKey = new Request(`${CANONICAL_ORIGIN}${canonicalPath}?v=${env.CATALOG_VERSION}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return stripHead(req, cached);
  }

  const index = await loadIndex(env);
  const meta = buildPageMeta(index, route);
  if (meta === undefined) {
    return env.ASSETS.fetch(req);
  }

  const shellResp = await env.ASSETS.fetch(new Request("https://assets.local/index.html"));
  if (!shellResp.ok) {
    return env.ASSETS.fetch(req);
  }

  const html = rewritePageTags(await shellResp.text(), meta);
  const headers = new Headers(shellResp.headers);
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Content-Type", "text/html; charset=utf-8");
  // Browsers revalidate like the plain shell, while the edge holds the
  // rewritten HTML for the deploy's lifetime (the cache key is versioned).
  headers.set("Cache-Control", "public, max-age=0, must-revalidate, s-maxage=604800");

  const resp = new Response(html, {
    status: shellResp.status,
    statusText: shellResp.statusText,
    headers,
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));

  return stripHead(req, resp);
}

function stripHead(req: Request, resp: Response): Response {
  return req.method === "HEAD" ? new Response(null, resp) : resp;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
