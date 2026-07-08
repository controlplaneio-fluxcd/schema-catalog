// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { mkdir, readdir, rename, rm, rmdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { CATALOG_DIR, HISTORY_DIR, ROOT_DIR } from "./paths.ts";
import type { HistoryEntry, ResourceNames } from "./types.ts";

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
 * Matches a catalog file path, tolerating an optional `catalog/` prefix so it
 * works on both staged (`<group>/<kind>_<version>.<ext>`) and history-manifest
 * (`catalog/<group>/<kind>_<version>.<ext>`) forms. Captures group, lowercase
 * kind slug, and extension.
 */
const KIND_FILE_RE = /(?:^|\/)([a-z0-9.-]+)\/([a-z0-9.-]+)_[a-z0-9]+\.(json|fields\.txt)$/;

/**
 * Drops every file belonging to a kind that has no `.fields.txt` index in the
 * set — the Kubernetes `*List` aggregate types, which flux-schema emits as a
 * bare schema with no field index and which the catalog does not serve. The
 * filter is kind-scoped, not file-scoped: a kind keeps all its schema versions
 * as long as at least one version has a field index, so a schema-only version
 * of an otherwise-indexed kind is never dropped. Non-conforming paths pass
 * through untouched for the stricter downstream guards to reject.
 */
export function pruneKindsWithoutFields(files: string[]): string[] {
  const indexed = new Set<string>();
  for (const file of files) {
    const match = file.match(KIND_FILE_RE);
    if (match !== null && match[3] === "fields.txt") {
      indexed.add(`${match[1]}/${match[2]}`);
    }
  }
  return files.filter((file) => {
    const match = file.match(KIND_FILE_RE);
    return match === null || match[3] === "fields.txt" || indexed.has(`${match[1]}/${match[2]}`);
  });
}

/** sha256 digest of a string or byte buffer, in `sha256:<hex>` form. */
export function sha256(data: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return `sha256:${hasher.digest("hex")}`;
}

/**
 * Aggregate digest over a source's catalog files: sha256 over one
 * `<path>:<sha256(content)>` line per file, sorted by path. One field makes
 * the whole file set tamper-evident without storing thousands of per-file
 * digests in the manifest.
 */
export async function digestFiles(
  files: string[],
  readBytes: (file: string) => Promise<Uint8Array>,
): Promise<string> {
  const lines: string[] = [];
  for (const file of [...files].sort()) {
    lines.push(`${file}:${sha256(await readBytes(file))}`);
  }
  return sha256(lines.join("\n"));
}

/** Extracts the original-cased kind from a `.fields.txt`'s `kind <string> enum=<Kind>` row. */
export function parseKindName(fieldsText: string): string | null {
  const match = fieldsText.match(/^kind <string> enum=(\S+)/m);
  return match === null ? null : match[1]!;
}

/** Merges original-cased indexed kind ids with any matching discovery names for history. */
export function historyKinds(
  resources: Record<string, ResourceNames>,
  kinds: string[],
): Record<string, ResourceNames> {
  const out: Record<string, ResourceNames> = {};
  for (const id of [...kinds].sort((a, b) => a.localeCompare(b))) {
    out[id] = resources[id] ?? {};
  }
  return out;
}

/**
 * Builds the sorted, unique `<group>/<Kind>` casing list recorded in the history
 * manifest, reading the kind's original casing from each `.fields.txt` via
 * `readText`. One entry per kind (casing is version-invariant); a fields index
 * missing its `kind` enum row fails the build loudly rather than losing casing.
 */
export async function kindCasing(
  files: string[],
  readText: (file: string) => Promise<string>,
): Promise<string[]> {
  const casing = new Map<string, string>();
  for (const file of files) {
    const match = file.match(KIND_FILE_RE);
    if (match === null || match[3] !== "fields.txt") {
      continue;
    }
    const key = `${match[1]}/${match[2]}`;
    if (casing.has(key)) {
      continue;
    }
    const kind = parseKindName(await readText(file));
    if (kind === null) {
      throw new Error(`no kind enum in ${file}`);
    }
    casing.set(key, `${match[1]}/${kind}`);
  }
  return [...casing.values()].sort();
}

/**
 * Copies staged files into catalog/ and returns their repo-root-relative
 * paths (catalog/<group>/<file>), the format stored in history manifests.
 * Byte-identical files are left untouched; `changed` counts the pre-existing
 * files whose content actually differed (new files are counted by the
 * caller's added/removed delta), so the build log can tell a verified no-op
 * rebuild apart from one that rewrote schemas.
 */
export async function syncCatalog(
  dir: string,
  staged: string[],
): Promise<{ files: string[]; changed: number }> {
  const files: string[] = [];
  let changed = 0;
  for (const rel of staged) {
    const dest = Bun.file(join(CATALOG_DIR, rel));
    const next = await Bun.file(join(dir, rel)).bytes();
    const prev = (await dest.exists()) ? await dest.bytes() : null;
    if (prev === null || Buffer.compare(prev, next) !== 0) {
      if (prev !== null) {
        changed++;
      }
      await Bun.write(dest, next);
    }
    files.push(join("catalog", rel));
  }
  return { files, changed };
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
