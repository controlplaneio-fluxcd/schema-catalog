// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Runs local development without Cloudflare credentials. A side Bun server
 * exposes the repo's `catalog/` tree, then `wrangler dev` receives
 * `CATALOG_DEV_ORIGIN` so `/catalog/*` uses the local dataset instead of R2.
 */
import { join, normalize } from "node:path";

const catalogDir = normalize(join(import.meta.dir, "..", "..", "catalog"));
const port = 8788;

const server = Bun.serve({
  port,
  async fetch(req) {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    const path = normalize(join(catalogDir, pathname));
    if (!path.startsWith(catalogDir + "/")) {
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

const wrangler = Bun.spawn(
  [
    "bunx",
    "wrangler",
    "dev",
    "--var",
    `CATALOG_DEV_ORIGIN:http://127.0.0.1:${server.port}`,
  ],
  { cwd: join(import.meta.dir, ".."), stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);

process.on("SIGINT", () => {
  wrangler.kill();
  server.stop();
});
await wrangler.exited;
server.stop();
process.exit(wrangler.exitCode ?? 0);
