// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Archives versioned catalog snapshots to the R2 bucket's `versions/` prefix:
 * `versions/<source>/<minor>/<group>/<kind>_<v>.json|.fields.txt` plus a
 * `manifest.json` copy of the source's history manifest, written last as the
 * commit marker. A snapshot whose remote manifest already carries the same
 * `filesDigest` is skipped, so re-deploys and schema-identical patch bumps
 * are no-ops. After the sync it rewrites `versions/<source>/index.json`, a
 * minor-sorted `[{minor, version, builtAt}]` list for later UI consumption.
 *
 * Usage (from the repo root, R2 creds via RCLONE_CONFIG_R2_* env vars):
 *   bun web/scripts/archive-versions.ts <source> [<source>...]
 *
 * The archived sources are the arguments; the allowlist lives in the
 * Makefile's `web-archive` target. `RCLONE` overrides the rclone binary.
 */
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const RCLONE = process.env.RCLONE || "rclone";
const REMOTE = process.env.ARCHIVE_REMOTE || "r2:schema-catalog";
const FLAGS = ["--s3-no-check-bucket", "--fast-list", "--checksum"];

interface HistoryEntry {
  name: string;
  version: string;
  commit: string;
  builtAt: string;
  filesDigest: string;
  files: string[];
}

/**
 * The snapshot key for a resolved version: the string up to and including the
 * first `major.minor` tail (`v1.36.2` -> `v1.36`, `v4.20` -> `v4.20`,
 * `gha-runner-scale-set-0.14.2` -> `gha-runner-scale-set-0.14`); a version
 * with no parsable tail keeps the full string.
 */
export function minorOf(version: string): string {
  return version.match(/^(.*?\d+\.\d+)/)?.[1] ?? version;
}

async function remoteManifest(name: string, minor: string): Promise<HistoryEntry | null> {
  const out = await $`${RCLONE} cat ${REMOTE}/versions/${name}/${minor}/manifest.json ${FLAGS}`
    .quiet()
    .nothrow();
  if (out.exitCode !== 0) {
    return null;
  }
  try {
    return JSON.parse(out.stdout.toString()) as HistoryEntry;
  } catch {
    return null;
  }
}

/** Uploads one source's snapshot; returns true when files were transferred. */
async function archiveSource(name: string): Promise<boolean> {
  const manifestFile = Bun.file(join("build", "history", `${name}.json`));
  if (!(await manifestFile.exists())) {
    throw new Error(`no history manifest for source '${name}'`);
  }
  const manifest = (await manifestFile.json()) as HistoryEntry;
  const minor = minorOf(manifest.version);
  const prefix = `versions/${name}/${minor}`;

  const remote = await remoteManifest(name, minor);
  if (remote?.filesDigest === manifest.filesDigest) {
    console.log(`  ${name} ${manifest.version}: skip, ${prefix} digest match`);
    return false;
  }

  // Stage the manifest's files so rclone sync mirrors the prefix exactly,
  // removing files a re-archive dropped. The stale manifest.json is absent
  // from staging, so the sync deletes it first and a crashed upload leaves
  // no commit marker; the next run then re-syncs the prefix.
  const staging = await mkdtemp(join(tmpdir(), `schema-catalog-archive-${name}-`));
  try {
    for (const file of manifest.files) {
      if (!file.startsWith("catalog/")) {
        throw new Error(`unexpected manifest file path: ${file}`);
      }
      await cp(file, join(staging, file.slice("catalog/".length)));
    }
    await $`${RCLONE} sync ${staging} ${REMOTE}/${prefix} ${FLAGS} --transfers 32 --stats-one-line`.quiet();

    const size = await $`${RCLONE} size ${REMOTE}/${prefix} --json ${FLAGS}`.quiet();
    const count = (JSON.parse(size.stdout.toString()) as { count: number }).count;
    if (count !== manifest.files.length) {
      throw new Error(`${prefix} holds ${count} objects, expected ${manifest.files.length}`);
    }

    await $`${RCLONE} copyto ${join("build", "history", `${name}.json`)} ${REMOTE}/${prefix}/manifest.json ${FLAGS}`.quiet();
    console.log(`  ${name} ${manifest.version}: archived ${manifest.files.length} files to ${prefix}`);
    return true;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Rewrites `versions/<name>/index.json` from the minors present remotely. */
async function writeIndex(name: string): Promise<void> {
  const dirs = await $`${RCLONE} lsf ${REMOTE}/versions/${name}/ --dirs-only ${FLAGS}`.quiet();
  const minors = dirs.stdout
    .toString()
    .split("\n")
    .map((line) => line.replace(/\/$/, ""))
    .filter((line) => line.length > 0);

  const entries: { minor: string; version: string; commit: string; builtAt: string }[] = [];
  for (const minor of minors) {
    // A prefix without a manifest is a crashed upload; leave it out until a
    // re-archive completes it.
    const manifest = await remoteManifest(name, minor);
    if (manifest !== null) {
      entries.push({
        minor,
        version: manifest.version,
        commit: manifest.commit,
        builtAt: manifest.builtAt,
      });
    }
  }
  entries.sort((a, b) => a.minor.localeCompare(b.minor, "en", { numeric: true }));

  const local = join(tmpdir(), `schema-catalog-index-${name}.json`);
  await Bun.write(local, `${JSON.stringify(entries, null, 2)}\n`);
  await $`${RCLONE} copyto ${local} ${REMOTE}/versions/${name}/index.json ${FLAGS}`.quiet();
  await rm(local, { force: true });
  console.log(`  ${name}: index.json lists ${entries.map((e) => e.minor).join(", ")}`);
}

if (import.meta.main) {
  const sources = process.argv.slice(2);
  if (sources.length === 0) {
    console.error("usage: bun web/scripts/archive-versions.ts <source> [<source>...]");
    process.exit(1);
  }

  console.log(`archive: ${sources.length} source(s) -> ${REMOTE}/versions`);
  let archived = 0;
  for (const name of sources) {
    if (await archiveSource(name)) {
      archived += 1;
    }
    // The index is rewritten even for skipped snapshots, so a format change
    // (or a crashed index upload) heals on the next deploy.
    await writeIndex(name);
  }
  console.log(`archive: ${archived} snapshot(s) uploaded, ${sources.length - archived} up to date`);
}
