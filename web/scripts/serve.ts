// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Wrangler-free local dev server for the explorer UI. One Bun server serves the
 * bundled UI from `dist/assets` and the repo's `catalog/` tree at `/catalog/*`,
 * watches `src/` to rebundle the UI on change, and live-reloads the browser over
 * SSE. It does NOT run the Worker, so `/mcp` is unavailable here — use
 * `make web-run` (wrangler) when you need to exercise the MCP endpoint.
 */
import { watch } from "node:fs";
import { join, normalize } from "node:path";

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
    if (pathname === "/catalog" || pathname.startsWith("/catalog/")) {
      return serveFile(catalogDir, pathname.slice("/catalog/".length));
    }
    return serveAsset(pathname);
  },
});

const watcher = watchUi(webRoot);

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
 * Serves a bundled UI asset, falling back to `index.html` for SPA hash routes
 * and any unknown path. `index.html` is served with the live-reload snippet
 * injected; assets carry `no-store` so a rebuilt bundle is never cached.
 */
async function serveAsset(pathname: string): Promise<Response> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let path = normalize(join(assetsDir, relative));
  let file = Bun.file(path);

  const inside = path === assetsDir || path.startsWith(assetsDir + "/");
  if (!inside || !(await file.exists())) {
    path = join(assetsDir, "index.html");
    file = Bun.file(path);
  }

  if (path.endsWith("index.html")) {
    const html = (await file.text()).replace("</body>", `    ${LIVE_RELOAD}\n  </body>`);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(file, { headers: { "cache-control": "no-store" } });
}

/**
 * Watches `src/` and rebundles the UI when a file the UI bundle depends on
 * changes, then live-reloads connected browsers. Rebuilds are debounced and
 * serialized so bursts of saves collapse into one build and never overlap.
 */
function watchUi(root: string): ReturnType<typeof watch> {
  const srcDir = join(root, "src");
  const buildScript = join(import.meta.dir, "build-ui.ts");
  let building = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rebuild = async (): Promise<void> => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    const proc = Bun.spawn(["bun", buildScript], { cwd: root, stdout: "inherit", stderr: "inherit" });
    const code = await proc.exited;
    building = false;
    if (code === 0) {
      console.log("[dev] UI rebuilt");
      reloadClients();
    } else {
      console.log(`[dev] UI build failed (exit ${code})`);
    }
    if (pending) {
      pending = false;
      await rebuild();
    }
  };

  const watcher = watch(srcDir, { recursive: true }, (_event, filename) => {
    if (filename === null) {
      return;
    }
    const path = filename.replaceAll("\\", "/");
    if (!path.startsWith("ui/") && !path.startsWith("shared/")) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 80);
  });

  console.log(`[dev] watching ${srcDir} -> rebundling UI on ui/ and shared/ changes`);
  return watcher;
}
