// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Runs local development without Cloudflare credentials. A side Bun server
 * exposes the repo's `catalog/` tree, then `wrangler dev` receives
 * `CATALOG_DEV_ORIGIN` so `/catalog/*` uses the local dataset instead of R2.
 *
 * `wrangler dev` already hot-reloads the Worker (`src/worker/**`) on save, but
 * the UI bundle in `dist/assets` is built once at startup. A recursive watcher
 * on `src/` rebundles the UI (`src/ui/**`, `src/shared/**`, `styles.css`) so any
 * change under `src/` is reflected without restarting the dev server.
 */
import { watch } from "node:fs";
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

/**
 * Watches `src/` and rebundles the UI when a file the UI bundle depends on
 * changes. Worker-only edits are ignored here because `wrangler dev` reloads
 * them itself. Rebuilds are debounced and serialized so bursts of saves collapse
 * into one build and never overlap.
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
    console.log(code === 0 ? "[dev] UI rebuilt" : `[dev] UI build failed (exit ${code})`);
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
