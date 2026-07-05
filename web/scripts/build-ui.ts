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
