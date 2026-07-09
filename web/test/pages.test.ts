// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import type { CatalogIndex } from "../src/shared/types.ts";
import type { Env } from "../src/worker/index.ts";
import {
  buildCanonicalPath,
  buildPageMeta,
  buildProjectPageMeta,
  parsePagePath,
  rewritePageTags,
  servePage,
} from "../src/worker/pages.ts";

const index: CatalogIndex = {
  v: 4,
  generatedAt: "2026-07-06T00:00:00.000Z",
  categories: ["Provisioning"],
  projects: [
    {
      name: "karpenter",
      alias: "Karpenter",
      cat: 0,
      repo: "kubernetes-sigs/karpenter",
      version: "v1.10.1",
      builtAt: "2026-07-06",
      groups: [
        {
          g: "karpenter.sh",
          kinds: [
            ["nodeclaim", ["v1"], 1, "NodeClaim"],
            ["nodepool", ["v1", "v1beta1"], 3, "NodePool"],
          ],
        },
      ],
    },
    {
      name: "solo",
      alias: "Solo",
      cat: 0,
      repo: "example/solo",
      builtAt: "2026-07-06",
      groups: [{ g: "solo.example.io", kinds: [["thing", ["v1"], 1, "Thing"]] }],
    },
    {
      name: "acme",
      alias: "ACME Operators",
      cat: 0,
      repo: "acme",
      builtAt: "2026-07-06",
      sources: [
        { name: "acme-queue", alias: "ACME Queue Controller", repo: "acme/queue", version: "v2.0.0", builtAt: "2026-07-06" },
        { name: "acme-storage", alias: "ACME Storage Controller", repo: "acme/storage", version: "v1.0.0", builtAt: "2026-07-06" },
      ],
      groups: [{ g: "acme.example.io", kinds: [["bucket", ["v1"], 1, "Bucket"]], src: [1] }],
    },
  ],
};

const shell = [
  "<!doctype html><html><head>",
  "<title>Flux Schema Catalog</title>",
  '<meta name="description" content="home">',
  '<meta property="og:title" content="home">',
  '<meta property="og:description" content="home">',
  '<meta property="og:url" content="https://schemas.fluxoperator.dev/">',
  '<link rel="canonical" href="https://schemas.fluxoperator.dev/">',
  "</head><body></body></html>",
].join("");

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

function createCtx(): { ctx: ExecutionContext; waitAll: () => Promise<void> } {
  const promises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      promises.push(promise);
    },
    passThroughOnException() {},
  } as ExecutionContext;

  return {
    ctx,
    async waitAll() {
      await Promise.all(promises);
    },
  };
}

function createEnv(version = "pages-test"): { env: Env; assetUrls: string[] } {
  const assetUrls: string[] = [];
  const assets = {
    async fetch(input: RequestInfo | URL): Promise<Response> {
      const url = cacheKeyUrl(input);
      assetUrls.push(url);
      const pathname = new URL(url).pathname;

      if (pathname === "/index.json") {
        return Response.json(index);
      }

      if (pathname === "/index.html") {
        return new Response(shell, {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": String(shell.length),
            ETag: '"shell"',
          },
        });
      }

      return new Response(`fallback:${pathname}`, {
        headers: { "X-Fallback-Path": pathname },
      });
    },
  } as unknown as Fetcher;

  return {
    env: { CATALOG: {} as R2Bucket, CATALOG_VERSION: version, ASSETS: assets },
    assetUrls,
  };
}

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://schemas.fluxoperator.dev${path}`, init);
}

describe("parsePagePath", () => {
  test("accepts only exact project and kind route shapes and decodes segments", () => {
    expect(parsePagePath("/p/karpenter")).toEqual({ type: "project", project: "karpenter" });
    expect(parsePagePath("/p/acme%20operators")).toEqual({ type: "project", project: "acme operators" });
    expect(parsePagePath("/k/karpenter.sh/nodepool/v1")).toEqual({
      type: "kind",
      group: "karpenter.sh",
      kind: "nodepool",
      version: "v1",
    });

    expect(parsePagePath("/p")).toBeUndefined();
    expect(parsePagePath("/p/karpenter/extra")).toBeUndefined();
    expect(parsePagePath("/k/karpenter.sh/nodepool")).toBeUndefined();
    expect(parsePagePath("/k/karpenter.sh/nodepool/v1/extra")).toBeUndefined();
    expect(parsePagePath("/p/%E0%A4%A")).toBeUndefined();
  });
});

describe("page meta builders", () => {
  test("buildProjectPageMeta uses the exact plural and singular formats", () => {
    expect(buildProjectPageMeta(index.projects[0]!)).toEqual({
      title: "Karpenter | Flux Schema Catalog",
      description:
        "JSON Schemas with LLM-optimized indexes for 2 Karpenter CRDs, extracted from upstream releases and rebuilt daily.",
    });
    expect(buildProjectPageMeta(index.projects[1]!)).toEqual({
      title: "Solo | Flux Schema Catalog",
      description:
        "JSON Schemas with LLM-optimized indexes for 1 Solo CRD, extracted from upstream releases and rebuilt daily.",
    });
  });

  test("buildPageMeta uses exact kind formats and source attribution", () => {
    expect(buildPageMeta(index, { type: "kind", group: "karpenter.sh", kind: "nodepool", version: "v1" })).toEqual({
      title: "NodePool (karpenter.sh/v1) | Flux Schema Catalog",
      description:
        "JSON Schema with LLM-optimized field index for NodePool, extracted from Karpenter v1.10.1 and rebuilt daily.",
      url: "https://schemas.fluxoperator.dev/k/karpenter.sh/nodepool/v1",
    });

    expect(buildPageMeta(index, { type: "kind", group: "acme.example.io", kind: "bucket", version: "v1" })).toEqual({
      title: "Bucket (acme.example.io/v1) | Flux Schema Catalog",
      description:
        "JSON Schema with LLM-optimized field index for Bucket, extracted from ACME Storage Controller v1.0.0 and rebuilt daily.",
      url: "https://schemas.fluxoperator.dev/k/acme.example.io/bucket/v1",
    });

    expect(buildPageMeta(index, { type: "kind", group: "solo.example.io", kind: "thing", version: "v1" })?.description).toBe(
      "JSON Schema with LLM-optimized field index for Thing, extracted from upstream releases and rebuilt daily.",
    );
  });

  test("buildPageMeta returns undefined for lookup misses and missing versions", () => {
    expect(buildPageMeta(index, { type: "project", project: "missing" })).toBeUndefined();
    expect(buildPageMeta(index, { type: "kind", group: "karpenter.sh", kind: "nodepool", version: "v2" })).toBeUndefined();
  });

  test("buildCanonicalPath encodes route segments", () => {
    expect(buildCanonicalPath({ type: "project", project: "a/b & c" })).toBe("/p/a%2Fb%20%26%20c");
    expect(buildCanonicalPath({ type: "kind", group: "example.io", kind: "fancy kind", version: "v1 beta" })).toBe(
      "/k/example.io/fancy%20kind/v1%20beta",
    );
  });
});

describe("rewritePageTags", () => {
  test("rewrites the same six tags as the UI build and escapes interpolated values", () => {
    const html = rewritePageTags(shell, {
      title: 'A & B <C> "D" | Flux Schema Catalog',
      description: 'JSON Schema for A & B <C> "D".',
      url: "https://schemas.fluxoperator.dev/p/a%26b",
    });

    expect(html).toContain("<title>A &amp; B &lt;C&gt; &quot;D&quot; | Flux Schema Catalog</title>");
    expect(html).toContain('<meta name="description" content="JSON Schema for A &amp; B &lt;C&gt; &quot;D&quot;.">');
    expect(html).toContain('<meta property="og:title" content="A &amp; B &lt;C&gt; &quot;D&quot; | Flux Schema Catalog">');
    expect(html).toContain('<meta property="og:description" content="JSON Schema for A &amp; B &lt;C&gt; &quot;D&quot;.">');
    expect(html).toContain('<meta property="og:url" content="https://schemas.fluxoperator.dev/p/a%26b">');
    expect(html).toContain('<link rel="canonical" href="https://schemas.fluxoperator.dev/p/a%26b">');
  });
});

describe("servePage", () => {
  test("rewrites project pages, caches them by catalog version, and serves HEAD without a body", async () => {
    const { env, assetUrls } = createEnv("pages-cache-v1");
    const cache = new MemoryCache();
    const firstCtx = createCtx();
    const first = await servePage(req("/p/karpenter"), env, firstCtx.ctx, cache);

    expect(first.status).toBe(200);
    expect(first.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(first.headers.get("ETag")).toBeNull();
    expect(await first.text()).toContain("<title>Karpenter | Flux Schema Catalog</title>");
    expect(assetUrls.map((url) => new URL(url).pathname)).toEqual(["/index.json", "/index.html"]);

    await firstCtx.waitAll();

    const headCtx = createCtx();
    const head = await servePage(req("/p/karpenter", { method: "HEAD" }), env, headCtx.ctx, cache);

    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await head.text()).toBe("");
    expect(assetUrls.map((url) => new URL(url).pathname)).toEqual(["/index.json", "/index.html"]);
  });

  test("falls through to Workers Assets unchanged on lookup misses", async () => {
    const { env } = createEnv("pages-miss-v1");
    const { ctx } = createCtx();
    const resp = await servePage(req("/p/missing"), env, ctx, new MemoryCache());

    expect(resp.headers.get("X-Fallback-Path")).toBe("/p/missing");
    expect(await resp.text()).toBe("fallback:/p/missing");
  });
});
