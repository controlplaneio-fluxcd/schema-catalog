import { mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CATALOG_DIR, HISTORY_DIR, ROOT_DIR } from "./paths.ts";
import type { HistoryEntry } from "./types.ts";

export async function readHistory(name: string): Promise<HistoryEntry | null> {
  const file = Bun.file(join(HISTORY_DIR, `${name}.json`));
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as HistoryEntry;
}

export async function writeHistory(entry: HistoryEntry): Promise<void> {
  await mkdir(HISTORY_DIR, { recursive: true });
  const path = join(HISTORY_DIR, `${entry.name}.json`);
  // Write-then-rename so a crash cannot leave a truncated manifest behind.
  await Bun.write(`${path}.tmp`, `${JSON.stringify(entry, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}

export async function deleteHistory(name: string): Promise<void> {
  await rm(join(HISTORY_DIR, `${name}.json`), { force: true });
}

/** Names of all sources that have a history manifest on disk. */
export async function listHistoryNames(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(HISTORY_DIR);
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.endsWith(".json"))
    .map((e) => e.slice(0, -".json".length))
    .sort();
}

/** True when every catalog file recorded in the manifest exists on disk. */
export async function historyFilesPresent(entry: HistoryEntry): Promise<boolean> {
  for (const file of entry.files) {
    if (!(await Bun.file(join(ROOT_DIR, file)).exists())) {
      return false;
    }
  }
  return true;
}

/** Lists files under the staging directory, relative and sorted. */
export async function listStagedFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
}

/**
 * Copies staged files into catalog/ and returns their repo-root-relative
 * paths (catalog/<group>/<file>), the format stored in history manifests.
 */
export async function syncCatalog(dir: string, staged: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const rel of staged) {
    await Bun.write(join(CATALOG_DIR, rel), Bun.file(join(dir, rel)));
    files.push(join("catalog", rel));
  }
  return files;
}

/**
 * Files owned by the previous build that the new build no longer produces,
 * excluding files currently owned by another source's manifest so GC can
 * never delete a file out from under its present owner.
 */
export function removedFiles(
  prev: HistoryEntry | null,
  files: string[],
  foreign: ReadonlySet<string>,
): string[] {
  if (prev === null) {
    return [];
  }
  const next = new Set(files);
  return prev.files.filter((f) => !next.has(f) && !foreign.has(f));
}

/** Deletes removed catalog files and prunes directories left empty. */
export async function gcCatalog(removed: string[]): Promise<void> {
  const dirs = new Set<string>();
  for (const repoRel of removed) {
    if (!repoRel.startsWith("catalog/")) {
      throw new Error(`refusing to delete non-catalog path from history: ${repoRel}`);
    }
    await rm(join(ROOT_DIR, repoRel), { force: true });
    dirs.add(dirname(join(ROOT_DIR, repoRel)));
  }
  for (const dir of dirs) {
    try {
      await rmdir(dir);
    } catch {
      // not empty or already gone
    }
  }
}
