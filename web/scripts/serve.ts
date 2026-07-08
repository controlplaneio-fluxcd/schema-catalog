// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Wrangler-free local dev server for the explorer UI. One Bun server serves the
 * bundled UI from `dist/assets` and the repo's `catalog/` tree at `/catalog/*`,
 * watches `src/` to rebundle the UI on change, and live-reloads the browser over
 * SSE. It does NOT run the Worker, so `/mcp` is unavailable here — use
 * `make web-run` (wrangler) when you need to exercise the MCP endpoint.
 */
import { join, normalize } from "node:path";
import { watchUi } from "./watch-ui.ts";

const webRoot = join(import.meta.dir, "..");
const assetsDir = normalize(join(webRoot, "dist", "assets"));
const catalogDir = normalize(join(webRoot, "..", "catalog"));
const port = Number(process.env.PORT) || 8787;

const encoder = new TextEncoder();
const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

/** Injected into `index.html` so the browser reloads when the UI is rebuilt. */
const LIVE_RELOAD =
  '<script>try{new EventSource("/__livereload").onmessage=function(){location.reload()}}catch(e){}</script>';

const server = Bun.serve({
  port,
  // The live-reload SSE stream is intentionally long-lived and mostly idle, so
  // disable Bun's default 10s idle timeout to keep it (and asset requests) open.
  idleTimeout: 0,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);

    if (pathname === "/__livereload") {
      return liveReloadResponse();
    }
    // `/catalog/<group>/<file>` streams the local catalog tree; the bare
    // `/catalog` path is the explorer page and resolves to `catalog.html`.
    if (pathname.startsWith("/catalog/")) {
      return serveFile(catalogDir, pathname.slice("/catalog/".length));
    }
    return serveAsset(pathname);
  },
});

const watcher = watchUi(webRoot, reloadClients);

console.log(`[dev] UI on http://localhost:${server.port} (no wrangler; /mcp not served here)`);
console.log(`[dev] catalog tree: ${catalogDir}`);

process.on("SIGINT", () => {
  watcher.close();
  server.stop(true);
  process.exit(0);
});

/** Streams a single Server-Sent Events channel used only to signal reloads. */
function liveReloadResponse(): Response {
  let self: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      self = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
    },
    cancel() {
      clients.delete(self);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

/** Tells every connected browser to reload after a successful UI rebuild. */
function reloadClients(): void {
  const chunk = encoder.encode("data: reload\n\n");
  for (const controller of clients) {
    try {
      controller.enqueue(chunk);
    } catch {
      clients.delete(controller);
    }
  }
}

/** Serves a file from `root` after confirming it stays inside that directory. */
async function serveFile(root: string, relative: string): Promise<Response> {
  const path = normalize(join(root, relative));
  if (path !== root && !path.startsWith(root + "/")) {
    return new Response("forbidden\n", { status: 403 });
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return new Response("not found\n", { status: 404 });
  }
  return new Response(file, { headers: { "cache-control": "no-store" } });
}

/**
 * Serves a bundled UI asset, mirroring Workers Assets html_handling: `/agents`
 * resolves to `agents.html`, and any unknown path falls back to `index.html`
 * for the history-routed SPA. HTML is served with the live-reload snippet
 * injected; assets carry `no-store` so a rebuilt bundle is never cached.
 */
async function serveAsset(pathname: string): Promise<Response> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let path = normalize(join(assetsDir, relative));
  let file = Bun.file(path);

  const inside = path === assetsDir || path.startsWith(assetsDir + "/");
  if (inside && !(await file.exists()) && !relative.includes(".")) {
    path = `${path}.html`;
    file = Bun.file(path);
  }
  if (!inside || !(await file.exists())) {
    path = join(assetsDir, "index.html");
    file = Bun.file(path);
  }

  if (path.endsWith(".html")) {
    const html = (await file.text()).replace("</body>", `    ${LIVE_RELOAD}\n  </body>`);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(file, { headers: { "cache-control": "no-store" } });
}
