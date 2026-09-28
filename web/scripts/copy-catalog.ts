// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Copies the latest catalog into Workers Assets for deployment. Local dev
 * serves the repo's catalog tree directly and skips this copy.
 */
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

export const ASSET_FILE_LIMIT = 100_000;
export const ASSET_FILE_THRESHOLD_PERCENT = 90;

// Wrangler excludes these metadata files only at the assets root.
const ASSET_METADATA_FILES = new Set(["_headers", "_redirects", ".assetsignore"]);

export async function countAssetFiles(assetsDir: string): Promise<number> {
  let count = 0;
  for await (const file of new Bun.Glob("**/*").scan({ cwd: assetsDir, dot: true, onlyFiles: true })) {
    if (!ASSET_METADATA_FILES.has(file)) count++;
  }
  return count;
}

export function checkAssetBudget(count: number, limit = ASSET_FILE_LIMIT): boolean {
  const threshold = (limit * ASSET_FILE_THRESHOLD_PERCENT) / 100;
  const percentage = ((count / limit) * 100).toFixed(3);
  console.log(
    `asset file budget: ${count} / ${limit} files (${percentage}%); threshold: ${threshold} files (${ASSET_FILE_THRESHOLD_PERCENT}%)`,
  );
  if (count >= threshold) {
    console.error(
      `Asset file budget exceeded: count ${count}, limit ${limit}, threshold ${threshold} (${ASSET_FILE_THRESHOLD_PERCENT}%); shard the catalog or exclude prefixes from the packaged assets.`,
    );
    return false;
  }
  return true;
}

if (import.meta.main) {
  const catalogDir = join(import.meta.dir, "..", "..", "catalog");
  const assetsDir = join(import.meta.dir, "..", "dist", "assets");
  const destination = join(assetsDir, "catalog");

  await rm(destination, { recursive: true, force: true });
  await cp(catalogDir, destination, { recursive: true });
  console.log(`catalog copied to ${destination}`);
  if (!checkAssetBudget(await countAssetFiles(assetsDir))) process.exit(1);
}
