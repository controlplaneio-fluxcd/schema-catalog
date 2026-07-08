// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogObject } from "./mcp-core.ts";
import type { Env } from "./index.ts";

/**
 * Accepts only generated catalog object names:
 * `<lowercase-group>/<lowercase-kind>_<version>.json|fields.txt`. The build and
 * `flux-schema` output lowercase group/kind filenames, so uppercase or path
 * traversal probes are rejected before touching R2.
 */
const keyPattern = /^[a-z0-9.-]+\/[a-z0-9.-]+_[a-z0-9]+\.(json|fields\.txt)$/;

/** Provenance manifests under the bucket's `history/` prefix: `history/<source>.json`. */
const historyKeyPattern = /^history\/[a-z0-9-]+\.json$/;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
  };
}

function notFound(): Response {
  return new Response("not found\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...corsHeaders(),
    },
  });
}

function stripHead(req: Request, resp: Response): Response {
  return req.method === "HEAD" ? new Response(null, resp) : resp;
}

/**
 * Serves `/catalog/*` objects and `/history/*` provenance manifests with
 * public CORS and edge caching. Only GET, HEAD, and OPTIONS are supported;
 * invalid keys and R2 misses return cacheable 404s because `flux-schema`
 * performs fall-through probes for alternate schema names. Cache keys include
 * `CATALOG_VERSION`, so deploys invalidate without purging old edge entries.
 */
export async function serveCatalog(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  cache: Cache = caches.default,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed\n", {
      status: 405,
      headers: { Allow: "GET, HEAD, OPTIONS" },
    });
  }

  const url = new URL(req.url);
  let key: string;
  let valid: boolean;

  try {
    const path = decodeURIComponent(url.pathname);
    // Catalog objects drop the /catalog/ prefix (the bucket root is the
    // catalog tree); history manifests keep theirs, matching the bucket's
    // history/ prefix the deploy syncs build/history into.
    key = path.startsWith("/catalog/") ? path.slice("/catalog/".length) : path.slice(1);
    valid = path.startsWith("/catalog/") ? keyPattern.test(key) : historyKeyPattern.test(key);
  } catch {
    return stripHead(req, notFound());
  }

  if (!valid) {
    return stripHead(req, notFound());
  }

  const cacheKey = new Request(`${url.origin}/catalog/${key}?v=${env.CATALOG_VERSION}`);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return stripHead(req, cached);
  }

  const obj = await getCatalogObject(env, key);

  if (obj === null) {
    const resp = notFound();
    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return stripHead(req, resp);
  }

  const resp = new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": key.endsWith(".json")
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8",
      ETag: obj.etag,
      "Cache-Control": "public, max-age=3600, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "ETag",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));

  return stripHead(req, resp);
}

/**
 * Loads a catalog object from R2 in production or from `CATALOG_DEV_ORIGIN` in
 * local development. The dev-origin swap is set by `scripts/dev.ts` so
 * `make web-run` can exercise `/catalog/*` against the repo-local catalog tree
 * without Cloudflare credentials.
 */
export async function getCatalogObject(env: Env, key: string): Promise<CatalogObject | null> {
  if (env.CATALOG_DEV_ORIGIN) {
    const resp = await fetch(`${env.CATALOG_DEV_ORIGIN.replace(/\/$/, "")}/${key}`);
    if (!resp.ok || resp.body === null) {
      return null;
    }
    const size = Number(resp.headers.get("Content-Length"));
    return {
      body: resp.body,
      etag: resp.headers.get("ETag") ?? '"dev"',
      size: Number.isSafeInteger(size) && size >= 0 ? size : null,
    };
  }
  const obj = await env.CATALOG.get(key);
  return obj === null
    ? null
    : {
        body: obj.body,
        etag: obj.httpEtag,
        size: typeof obj.size === "number" ? obj.size : null,
      };
}
