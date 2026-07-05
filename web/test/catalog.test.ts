import { describe, expect, test } from "bun:test";
import { serveCatalog } from "../src/worker/catalog.ts";
import type { Env } from "../src/worker/index.ts";

const objects = new Map<string, string>([
  ["flagger.app/canary_v1beta1.json", "{\"a\":1}"],
  ["flagger.app/canary_v1beta1.fields.txt", "spec <object>"],
]);

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

function createEnv(version = "dev"): { env: Env; getCount: () => number } {
  let getCalls = 0;
  const bucket = {
    async get(key: string): Promise<R2ObjectBody | null> {
      getCalls += 1;
      const value = objects.get(key);

      if (value === undefined) {
        return null;
      }

      const body = new Response(value).body;
      if (body === null) {
        throw new Error("expected response body");
      }

      return {
        body,
        httpEtag: "\"abc\"",
      } as R2ObjectBody;
    },
  } as R2Bucket;

  return {
    env: { CATALOG: bucket, CATALOG_VERSION: version },
    getCount: () => getCalls,
  };
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

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://schemas.fluxoperator.dev${path}`, init);
}

function catalogReq(key: string, init?: RequestInit): Request {
  return req(`/catalog/${encodeURIComponent(key)}`, init);
}

describe("serveCatalog", () => {
  test("GET .json returns JSON with CORS and ETag", async () => {
    const { env } = createEnv();
    const { ctx } = createCtx();
    const resp = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json"),
      env,
      ctx,
      new MemoryCache(),
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(resp.headers.get("ETag")).toBe("\"abc\"");
    expect(await resp.text()).toBe("{\"a\":1}");
  });

  test("GET .fields.txt returns text", async () => {
    const { env } = createEnv();
    const { ctx } = createCtx();
    const resp = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.fields.txt"),
      env,
      ctx,
      new MemoryCache(),
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await resp.text()).toBe("spec <object>");
  });

  test("GET missing key caches 404 responses", async () => {
    const { env, getCount } = createEnv();
    const cache = new MemoryCache();
    const firstCtx = createCtx();
    const first = await serveCatalog(
      catalogReq("flagger.app/missing_v1beta1.json"),
      env,
      firstCtx.ctx,
      cache,
    );

    expect(first.status).toBe(404);
    expect(first.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(getCount()).toBe(1);

    await firstCtx.waitAll();

    const secondCtx = createCtx();
    const second = await serveCatalog(
      catalogReq("flagger.app/missing_v1beta1.json"),
      env,
      secondCtx.ctx,
      cache,
    );

    expect(second.status).toBe(404);
    expect(await second.text()).toBe("not found\n");
    expect(getCount()).toBe(1);
  });

  test("second GET of existing key hits cache", async () => {
    const { env, getCount } = createEnv();
    const cache = new MemoryCache();
    const firstCtx = createCtx();
    const first = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json"),
      env,
      firstCtx.ctx,
      cache,
    );

    expect(first.status).toBe(200);
    expect(getCount()).toBe(1);
    await firstCtx.waitAll();

    const secondCtx = createCtx();
    const second = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json"),
      env,
      secondCtx.ctx,
      cache,
    );

    expect(second.status).toBe(200);
    expect(await second.text()).toBe("{\"a\":1}");
    expect(getCount()).toBe(1);
  });

  test("different CATALOG_VERSION values produce different cache keys", async () => {
    const { env, getCount } = createEnv("one");
    const cache = new MemoryCache();
    const firstCtx = createCtx();
    const first = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json"),
      env,
      firstCtx.ctx,
      cache,
    );

    expect(first.status).toBe(200);
    expect(getCount()).toBe(1);
    await firstCtx.waitAll();

    env.CATALOG_VERSION = "two";

    const secondCtx = createCtx();
    const second = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json"),
      env,
      secondCtx.ctx,
      cache,
    );

    expect(second.status).toBe(200);
    expect(getCount()).toBe(2);
  });

  test("garbage keys return 404 without touching R2", async () => {
    const { env, getCount } = createEnv();
    const cache = new MemoryCache();

    for (const key of [
      "../../etc/passwd",
      "foo//bar_v1.json",
      "Foo/Bar_v1.json",
      "foo/bar.json",
    ]) {
      const { ctx } = createCtx();
      const resp = await serveCatalog(catalogReq(key), env, ctx, cache);
      expect(resp.status).toBe(404);
    }

    expect(getCount()).toBe(0);
  });

  test("OPTIONS returns preflight headers and POST returns 405", async () => {
    const { env } = createEnv();
    const cache = new MemoryCache();
    const optionsCtx = createCtx();
    const options = await serveCatalog(
      req("/catalog/flagger.app/canary_v1beta1.json", { method: "OPTIONS" }),
      env,
      optionsCtx.ctx,
      cache,
    );

    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(options.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
    expect(options.headers.get("Access-Control-Allow-Headers")).toBe("*");
    expect(options.headers.get("Access-Control-Max-Age")).toBe("86400");

    const postCtx = createCtx();
    const post = await serveCatalog(
      req("/catalog/flagger.app/canary_v1beta1.json", { method: "POST" }),
      env,
      postCtx.ctx,
      cache,
    );

    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });

  test("HEAD of existing key returns headers and empty body", async () => {
    const { env } = createEnv();
    const { ctx } = createCtx();
    const resp = await serveCatalog(
      catalogReq("flagger.app/canary_v1beta1.json", { method: "HEAD" }),
      env,
      ctx,
      new MemoryCache(),
    );

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(resp.headers.get("ETag")).toBe("\"abc\"");
    expect(await resp.text()).toBe("");
  });
});
