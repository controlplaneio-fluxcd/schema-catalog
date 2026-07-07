// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { serveMcpCatalog, serveServerCard } from "../src/worker/server-card.ts";

describe("serveServerCard", () => {
  test("serves the card with discovery headers and the request origin's endpoint", async () => {
    const response = serveServerCard(new Request("https://schemas.fluxoperator.dev/.well-known/mcp/server-card.json"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age");

    const card = (await response.json()) as {
      name: string;
      version: string;
      serverInfo: { name: string; version: string };
      transport: unknown;
      remotes: Array<{ url: string; supportedProtocolVersions: string[] }>;
      capabilities: { tools: unknown };
    };
    expect(card.name).toBe("dev.fluxoperator/flux-schema-catalog");
    expect(card.version).toBe(card.serverInfo.version);
    expect(card.serverInfo.name).toBe("flux-schema-catalog");
    expect(card.transport).toEqual({
      type: "streamable-http",
      endpoint: "https://schemas.fluxoperator.dev/mcp",
    });
    expect(card.remotes[0]?.url).toBe("https://schemas.fluxoperator.dev/mcp");
    expect(card.remotes[0]?.supportedProtocolVersions.length).toBeGreaterThan(0);
    expect(card.capabilities.tools).toEqual({ listChanged: true });
  });

  test("negotiates the reserved server-card media type via Accept", () => {
    const response = serveServerCard(
      new Request("http://localhost:8787/mcp/server-card", {
        headers: { accept: "application/mcp-server-card+json" },
      }),
    );
    expect(response.headers.get("content-type")).toBe("application/mcp-server-card+json");
  });

  test("keeps http for localhost but forces https elsewhere", async () => {
    const local = (await serveServerCard(new Request("http://localhost:8787/mcp/server-card")).json()) as {
      transport: { endpoint: string };
    };
    expect(local.transport.endpoint).toBe("http://localhost:8787/mcp");

    const proxied = (await serveServerCard(new Request("http://schemas.fluxoperator.dev/mcp/server-card")).json()) as {
      transport: { endpoint: string };
    };
    expect(proxied.transport.endpoint).toBe("https://schemas.fluxoperator.dev/mcp");
  });
});

describe("serveMcpCatalog", () => {
  test("lists the server card at the spec-reserved location", async () => {
    const response = serveMcpCatalog(new Request("https://schemas.fluxoperator.dev/.well-known/mcp/catalog.json"));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const catalog = (await response.json()) as { specVersion: string; entries: unknown };
    expect(catalog.specVersion).toBe("draft");
    expect(catalog.entries).toEqual([
      {
        identifier: "urn:air:fluxoperator.dev:flux-schema-catalog",
        displayName: "Flux Schema Catalog",
        mediaType: "application/mcp-server-card+json",
        url: "https://schemas.fluxoperator.dev/mcp/server-card",
      },
    ]);
  });
});
