// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Env } from "../src/worker/index.ts";

// The MCP transport imports Cloudflare-only modules unavailable in Bun.
mock.module("agents/mcp/server", () => ({
  createMcpHandler() {
    throw new Error("MCP is not used in router tests");
  },
}));
const { default: worker } = await import("../src/worker/index.ts");

class MemoryCache implements Cache {
  readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(cacheKeyUrl(request))?.clone();
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(cacheKeyUrl(request), response.clone());
  }

  async delete(request: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(cacheKeyUrl(request));
  }
}

function cacheKeyUrl(request: RequestInfo | URL): string {
  return request instanceof Request ? request.url : request.toString();
}

const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
let cache: MemoryCache;

beforeEach(() => {
  cache = new MemoryCache();
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: cache } });
});

afterEach(() => {
  if (originalCaches) {
    Object.defineProperty(globalThis, "caches", originalCaches);
  } else {
    Reflect.deleteProperty(globalThis, "caches");
  }
});

function createEnv(
  { assetStatus = 404, shellStatus = 200 } = {},
): { env: Env; assetRequests: Request[]; bucketKeys: string[] } {
  const assetRequests: Request[] = [];
  const bucketKeys: string[] = [];
  return {
    env: {
      CATALOG_VERSION: "worker-test",
      CATALOG: {
        async get(key: string) {
          bucketKeys.push(key);
          return null;
        },
      } as unknown as R2Bucket,
      ASSETS: {
        async fetch(input: RequestInfo | URL) {
          const request = input instanceof Request ? input : new Request(input.toString());
          assetRequests.push(request);
          const shell = new URL(request.url).pathname === "/";
          const status = shell ? shellStatus : assetStatus;
          return new Response(status === 204 || status === 304 ? null : shell ? "<html>shell</html>" : "asset", {
            status,
            headers: {
              "Content-Type": shell ? "text/html; charset=utf-8" : "text/plain",
              ETag: shell ? '"shell"' : '"asset"',
            },
          });
        },
      } as unknown as Fetcher,
    },
    assetRequests,
    bucketKeys,
  };
}

function createCtx(): { ctx: ExecutionContext; waitAll: () => Promise<void> } {
  const promises: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil(promise: Promise<unknown>) {
        promises.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext,
    async waitAll() {
      await Promise.all(promises);
    },
  };
}

function req(path: string, init?: RequestInit): Parameters<typeof worker.fetch>[0] {
  return new Request(`https://schemas.fluxoperator.dev${path}`, init) as Parameters<typeof worker.fetch>[0];
}

describe("Worker asset fallback", () => {
  test("serves the root shell on GET and HEAD asset misses, with or without navigation headers", async () => {
    for (const method of ["GET", "HEAD"]) {
      for (const navigate of [false, true]) {
        const { env, assetRequests, bucketKeys } = createEnv();
        const { ctx } = createCtx();
        const response = await worker.fetch(req("/mcp-server?tab=tools", {
          method,
          headers: navigate ? { "Sec-Fetch-Mode": "navigate" } : {},
        }), env, ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
        expect(response.headers.get("ETag")).toBe('"shell"');
        expect(await response.text()).toBe(method === "HEAD" ? "" : "<html>shell</html>");
        expect(assetRequests.map((request) => [new URL(request.url).pathname, request.method])).toEqual([
          ["/mcp-server", method],
          ["/", method],
        ]);
        expect(bucketKeys).toEqual([]);
      }
    }
  });

  test("does not replace non-404 asset responses with the shell", async () => {
    for (const status of [200, 204, 301, 304, 403, 405, 500]) {
      for (const method of ["GET", "HEAD"]) {
        const { env, assetRequests } = createEnv({ assetStatus: status });
        const { ctx } = createCtx();
        const response = await worker.fetch(req("/asset.js", { method }), env, ctx);

        expect(response.status).toBe(status);
        expect(response.headers.get("ETag")).toBe('"asset"');
        expect(assetRequests).toHaveLength(1);
      }
    }
  });

  test("does not replace asset misses for other methods with the shell", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const { env, assetRequests } = createEnv();
      const { ctx } = createCtx();
      const response = await worker.fetch(req("/unknown/", { method }), env, ctx);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe("asset");
      expect(assetRequests).toHaveLength(1);
    }
  });

  test("preserves shell failure status and HEAD semantics", async () => {
    for (const status of [404, 503]) {
      for (const method of ["GET", "HEAD"]) {
        const { env, assetRequests } = createEnv({ shellStatus: status });
        const { ctx } = createCtx();
        const response = await worker.fetch(req("/unknown/", { method }), env, ctx);

        expect(response.status).toBe(status);
        expect(await response.text()).toBe(method === "HEAD" ? "" : "<html>shell</html>");
        expect(assetRequests).toHaveLength(2);
      }
    }
  });

  test("keeps the catalog explorer on its own asset route", async () => {
    const { env, assetRequests, bucketKeys } = createEnv({ assetStatus: 200 });
    const { ctx } = createCtx();
    const response = await worker.fetch(req("/catalog/"), env, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset");
    expect(assetRequests.map((request) => new URL(request.url).pathname)).toEqual(["/catalog/"]);
    expect(bucketKeys).toEqual([]);
  });
});

describe("Worker catalog routing", () => {
  test("keeps catalog, versioned, and history misses as cacheable CORS 404s, even on navigation", async () => {
    for (const [path, key] of [
      ["/catalog/missing.example.io/missing_v1.json", "latest/missing.example.io/missing_v1.json"],
      ["/catalog/versions/kubernetes/v1.35/apps/missing_v1.json", "versions/kubernetes/v1.35/apps/missing_v1.json"],
      ["/history/missing.json", "history/missing.json"],
    ] as const) {
      const { env, assetRequests, bucketKeys } = createEnv();
      for (const method of ["GET", "HEAD"]) {
        const { ctx, waitAll } = createCtx();
        const response = await worker.fetch(req(path, {
          method,
          headers: { "Sec-Fetch-Mode": "navigate" },
        }), env, ctx);

        expect(response.status).toBe(404);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
        expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
        expect(await response.text()).toBe(method === "HEAD" ? "" : "not found\n");
        await waitAll();
      }
      expect(bucketKeys).toEqual([key]);
      expect(assetRequests).toEqual([]);
    }
    expect(cache.entries.size).toBe(3);
  });

  test("returns 204 for schema OPTIONS reaching the Worker without an asset fallback", async () => {
    const { env, assetRequests, bucketKeys } = createEnv();
    const { ctx } = createCtx();
    const response = await worker.fetch(req("/catalog/missing.example.io/missing_v1.json", {
      method: "OPTIONS",
    }), env, ctx);

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
    expect(await response.text()).toBe("");
    expect(assetRequests).toEqual([]);
    expect(bucketKeys).toEqual([]);
  });
});
