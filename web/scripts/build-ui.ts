// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Bundles the vanilla TypeScript UI for Workers Assets and copies static files
 * into `dist/assets`. This script assumes `scripts/gen-index.ts` has already
 * produced `index.json` in the same output directory.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const staticDir = join(webRoot, "static");
const assetsDir = join(webRoot, "dist/assets");

await mkdir(assetsDir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(webRoot, "src/ui/main.ts")],
  outdir: assetsDir,
  target: "browser",
  minify: {
    syntax: true,
    whitespace: true,
    identifiers: false,
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error("UI build failed");
}

for (const entry of await readdir(staticDir, { withFileTypes: true })) {
  if (entry.isFile()) {
    await copyFile(join(staticDir, entry.name), join(assetsDir, entry.name));
  }
}

await copyFile(join(webRoot, "src/ui/styles.css"), join(assetsDir, "styles.css"));

/**
 * Indexable pages prerendered from the app shell with page-specific meta.
 * Workers Assets serves `/agents` from `agents.html`, and the SPA takes over
 * on load; every other path falls back to `index.html` (see wrangler.jsonc
 * `not_found_handling`).
 */
const PAGES: Array<{ file: string; path: string; title: string; description: string }> = [
  {
    file: "catalog.html",
    path: "/catalog",
    title: "Flux Schema Catalog: Kubernetes and CNCF schemas",
    description:
      "JSON Schemas and field indexes for Kubernetes core, OpenShift, the Flux ecosystem, and CNCF projects. Filter by name, API group, or kind and open a project for its versions.",
  },
  {
    file: "agents.html",
    path: "/agents",
    title: "Flux Schema MCP Server: an LLM-friendly kubectl explain",
    description:
      "Connect any MCP client to the Flux Schema Catalog: your agent greps exact Kubernetes fields, types, and constraints for the whole CNCF ecosystem, no cluster required.",
  },
  {
    file: "cli.html",
    path: "/cli",
    title: "Flux Schema CLI: validate Kubernetes manifests in CI",
    description:
      "Static validation for GitOps workflows with Kubernetes API server semantics. Catch invalid manifests in pull requests, before Flux reconciles them on clusters.",
  },
];

const shell = await Bun.file(join(assetsDir, "index.html")).text();
for (const page of PAGES) {
  const url = `https://schemas.fluxoperator.dev${page.path}`;
  const html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${page.description}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${page.title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${page.description}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  if (html === shell) {
    throw new Error(`prerender produced no changes for ${page.path}: check the index.html meta tags`);
  }
  await Bun.write(join(assetsDir, page.file), html);
}
