// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

/** Runtime identity, shared verbatim between the MCP server and its Server Card. */
export const SERVER_INFO = { name: "flux-schema-catalog", title: "Flux Schema Catalog", version: "0.1.0" };

const SERVER_DESCRIPTION =
  "Authoritative JSON Schemas and greppable field indexes for core Kubernetes, OpenShift, the Flux ecosystem, " +
  "and a broad set of CNCF projects — an LLM-friendly kubectl explain for manifest work, no cluster required.";

/** Server Card media type reserved by SEP-2127. */
const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json";

/** Cards are public read-only metadata: open CORS and an hour of caching. */
const DISCOVERY_HEADERS = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
};

/**
 * Returns the request's origin with the protocol forced to https everywhere
 * but local development: discovery documents must never advertise a plain
 * http endpoint even when a dev proxy downgrades the incoming request URL.
 */
function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    url.protocol = "https:";
  }
  return url.origin;
}

/**
 * Serves the MCP Server Card (SEP-2127) for pre-connection discovery. The
 * card carries the draft registry shape (name/version/remotes) plus the
 * earlier serverInfo/transport/capabilities fields that discovery scanners
 * still check; every value mirrors what the live server reports.
 */
export function serveServerCard(req: Request): Response {
  const endpoint = `${requestOrigin(req)}/mcp`;
  const card = {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "dev.fluxoperator/flux-schema-catalog",
    title: SERVER_INFO.title,
    description: SERVER_DESCRIPTION,
    version: SERVER_INFO.version,
    websiteUrl: "https://schemas.fluxoperator.dev",
    repository: { url: "https://github.com/controlplaneio-fluxcd/schema-catalog", source: "github" },
    remotes: [
      { type: "streamable-http", url: endpoint, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS },
    ],
    serverInfo: SERVER_INFO,
    transport: { type: "streamable-http", endpoint },
    capabilities: { tools: { listChanged: true } },
  };
  const accept = req.headers.get("accept") ?? "";
  return new Response(`${JSON.stringify(card, null, 2)}\n`, {
    headers: {
      ...DISCOVERY_HEADERS,
      "content-type": accept.includes(SERVER_CARD_MEDIA_TYPE) ? SERVER_CARD_MEDIA_TYPE : "application/json",
    },
  });
}

/** Serves the MCP Catalog, the `.well-known` discovery entrypoint (SEP-2127). */
export function serveMcpCatalog(req: Request): Response {
  const catalog = {
    specVersion: "draft",
    entries: [
      {
        identifier: "urn:air:fluxoperator.dev:flux-schema-catalog",
        displayName: SERVER_INFO.title,
        mediaType: SERVER_CARD_MEDIA_TYPE,
        url: `${requestOrigin(req)}/mcp/server-card`,
      },
    ],
  };
  return new Response(`${JSON.stringify(catalog, null, 2)}\n`, {
    headers: { ...DISCOVERY_HEADERS, "content-type": "application/json" },
  });
}
