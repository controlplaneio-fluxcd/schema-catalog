// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Runs local development without Cloudflare credentials. A side Bun server
 * mirrors the bucket layout onto the repo's trees (`latest/` -> `catalog/`,
 * `history/` -> `build/history/`), then `wrangler dev` receives
 * `CATALOG_DEV_ORIGIN` so `/catalog/*` uses the local dataset instead of R2.
 *
 * `wrangler dev` already hot-reloads the Worker (`src/worker/**`) on save, but
 * the UI bundle in `dist/assets` is built once at startup. A recursive watcher
 * on `src/` rebundles the UI (`src/ui/**`, `src/shared/**`, `styles.css`) so any
 * change under `src/` is reflected without restarting the dev server.
 */
import { join, normalize } from "node:path";
import { watchUi } from "./watch-ui.ts";

const catalogDir = normalize(join(import.meta.dir, "..", "..", "catalog"));
const historyDir = normalize(join(import.meta.dir, "..", "..", "build", "history"));
const port = 8788;

const server = Bun.serve({
  port,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    // Mirror the bucket layout: latest/* keys map to the catalog tree and
    // history/* keys to build/history; anything else has no local backing.
    const latest = pathname.startsWith("/latest/");
    const history = pathname.startsWith("/history/");
    if (!latest && !history) {
      return new Response("not found\n", { status: 404 });
    }
    const root = history ? historyDir : catalogDir;
    const path = normalize(join(root, pathname.slice((history ? "/history" : "/latest").length)));
    if (!path.startsWith(root + "/")) {
      return new Response("forbidden\n", { status: 403 });
    }
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return new Response("not found\n", { status: 404 });
    }
    return new Response(file);
  },
});

console.log(`catalog dev origin: http://127.0.0.1:${server.port} -> ${catalogDir}`);

const webRoot = join(import.meta.dir, "..");
const wrangler = Bun.spawn(
  [
    "bunx",
    "wrangler",
    "dev",
    "--var",
    `CATALOG_DEV_ORIGIN:http://127.0.0.1:${server.port}`,
  ],
  { cwd: webRoot, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);

const watcher = watchUi(webRoot);

process.on("SIGINT", () => {
  watcher.close();
  wrangler.kill();
  server.stop();
});
await wrangler.exited;
watcher.close();
server.stop();
process.exit(wrangler.exitCode ?? 0);
