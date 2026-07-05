import type { Env } from "./index.ts";

const keyPattern = /^[a-z0-9.-]+\/[a-z0-9.-]+_[a-z0-9]+\.(json|fields\.txt)$/;

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

  try {
    key = decodeURIComponent(url.pathname.slice("/catalog/".length));
  } catch {
    return stripHead(req, notFound());
  }

  if (!key || !keyPattern.test(key)) {
    return stripHead(req, notFound());
  }

  const cacheKey = new Request(`${url.origin}/catalog/${key}?v=${env.CATALOG_VERSION}`);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return stripHead(req, cached);
  }

  const obj = await env.CATALOG.get(key);

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
      ETag: obj.httpEtag,
      "Cache-Control": "public, max-age=3600, s-maxage=604800",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "ETag",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));

  return stripHead(req, resp);
}
