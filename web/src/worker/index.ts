// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { serveCatalog } from "./catalog.ts";
import { handleMcp } from "./mcp.ts";
import { serveMcpCatalog, serveServerCard } from "./server-card.ts";

/**
 * Cloudflare Worker bindings. `CATALOG_VERSION` is part of the edge cache key
 * and is set to the deployed commit SHA in production; `CATALOG_DEV_ORIGIN`
 * swaps R2 reads for a local catalog file server during `make web-run`.
 */
export interface Env {
  CATALOG: R2Bucket;
  CATALOG_VERSION: string;
  CATALOG_DEV_ORIGIN?: string;
  ASSETS: Fetcher;
}

export default {
  fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);

    // `/catalog/<group>/<file>` streams catalog objects; the bare `/catalog`
    // path is the explorer page and falls through to Workers Assets.
    if (pathname.startsWith("/catalog/")) {
      return serveCatalog(req, env, ctx);
    }

    if (pathname === "/mcp") {
      return handleMcp(req, env, ctx);
    }

    // SEP-2127 agent discovery: the Server Card at its spec-reserved location
    // plus the legacy .well-known path scanners probe, and the MCP Catalog.
    if (pathname === "/mcp/server-card" || pathname === "/.well-known/mcp/server-card.json") {
      return serveServerCard(req);
    }

    if (pathname === "/.well-known/mcp/catalog.json") {
      return serveMcpCatalog(req);
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
