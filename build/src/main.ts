// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parsePositiveIntegerFlag } from "./cli.ts";
import { loadConfig, repoOf } from "./config.ts";
import { extractSource, fluxSchemaVersion } from "./extract.ts";
import {
  deleteHistory,
  gcCatalog,
  historyFilesPresent,
  historyKinds,
  kindCasing,
  listHistoryNames,
  listStagedFiles,
  pruneKindsWithoutFields,
  readHistory,
  removedFiles,
  syncCatalog,
  writeHistory,
} from "./history.ts";
import { README_PATH, ROOT_DIR, SOURCES_PATH } from "./paths.ts";
import { runBoundedPool } from "./pool.ts";
import { updateReadme } from "./readme.ts";
import { commitSha } from "./github.ts";
import { displayVersion, resolveVersion, sourceRef } from "./resolve.ts";
import { renderBuildSummary } from "./summary.ts";
import type { BuildChange, OrphanRemoval, SourceFailure } from "./summary.ts";
import type { HistoryEntry, Source } from "./types.ts";

const USAGE = `Usage: bun run <command> [options]

Commands:
  build   Resolve versions, extract schemas, GC and update history
  regen   Rebuild the catalog at the versions pinned in build/history

Options:
  --source <name>   Process a single source from build/config/sources.yaml
  --force           Rebuild even when the resolved version is unchanged
  --summary <path>  Write a markdown summary of the changes (for PR bodies)
  --concurrent <n>  Process up to n sources at once (default: 2)
  --run-to-completion  Don't abort on a source failure; report failures instead
                       (exit 0 and, with --summary, list them in the PR body)
  -h, --help        Show this help message
`;

interface Options {
  command: "build" | "regen";
  force: boolean;
  toolVersion: string;
}

/** Catalog files owned by sources other than `name`, per current manifests. */
function foreignFiles(history: Map<string, HistoryEntry | null>, name: string): Set<string> {
  const foreign = new Set<string>();
  for (const [owner, entry] of history) {
    if (owner !== name && entry !== null) {
      for (const file of entry.files) {
        foreign.add(file);
      }
    }
  }
  return foreign;
}

async function processSource(
  source: Source,
  opts: Options,
  history: Map<string, HistoryEntry | null>,
): Promise<BuildChange | null> {
  const prev = history.get(source.name) ?? null;

  let version: string;
  if (opts.command === "regen") {
    if (prev === null) {
      throw new Error("no history entry; run 'build' first");
    }
    version = prev.version;
  } else {
    version = await resolveVersion(source);
    if (!opts.force && prev?.version === version) {
      if (await historyFilesPresent(prev)) {
        console.log(`  ${source.name}: ${displayVersion(version)} is up to date, skipped`);
        return null;
      }
      console.log(`  ${source.name}: ${displayVersion(version)} has missing catalog files, rebuilding`);
    }
  }

  const foreign = foreignFiles(history, source.name);
  const staging = await mkdtemp(join(tmpdir(), `schema-catalog-${source.name}-`));
  try {
    const extraction = await extractSource(source, version, staging);
    const staged = await listStagedFiles(staging);
    if (staged.length === 0) {
      throw new Error(`extraction at ${version} produced no files`);
    }
    // Drop the *List aggregate kinds (schema, no field index) before syncing so
    // they never enter the catalog; GC removes any left by an earlier build.
    const kept = pruneKindsWithoutFields(staged);
    if (kept.length === 0) {
      throw new Error(`extraction at ${version} produced only fieldless kinds`);
    }
    const conflicts = kept.map((rel) => join("catalog", rel)).filter((f) => foreign.has(f));
    if (conflicts.length > 0) {
      const owner = [...history].find(([, e]) => e?.files.includes(conflicts[0]!))?.[0];
      throw new Error(
        `refusing to overwrite ${conflicts.length} file(s) owned by source '${owner}',` +
          ` e.g. ${conflicts[0]}`,
      );
    }
    const { files, changed } = await syncCatalog(staging, kept);
    const kindIds = await kindCasing(kept, (rel) => Bun.file(join(staging, rel)).text());
    const kinds = historyKinds(extraction.resources, kindIds);
    const removed = removedFiles(prev, files, foreign);
    await gcCatalog(removed);
    // Recorded alongside the version: tags are mutable, so only the SHA pins
    // what this build actually extracted.
    const commit = await commitSha(repoOf(source), sourceRef(source, version));
    const entry: HistoryEntry = {
      name: source.name,
      repo: repoOf(source),
      version,
      commit,
      builtAt: new Date().toISOString(),
      fluxSchemaVersion: opts.toolVersion,
      kinds,
      files,
    };
    await writeHistory(entry);
    history.set(source.name, entry);
    const prevSet = new Set(prev?.files ?? []);
    const added = files.filter((f) => !prevSet.has(f)).length;
    console.log(
      `  ${source.name}: ${prev ? displayVersion(prev.version) : "none"} -> ${displayVersion(version)},` +
        ` ${files.length} files (+${added} -${removed.length} ~${changed})`,
    );
    return {
      repo: entry.repo,
      prevVersion: prev?.version ?? null,
      version,
      files: files.length,
      added,
      removed: removed.length,
      changed,
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** GC catalog files and manifests of sources no longer in sources.yaml. */
async function gcOrphanedSources(
  configured: Set<string>,
  history: Map<string, HistoryEntry | null>,
): Promise<OrphanRemoval[]> {
  const orphans: OrphanRemoval[] = [];
  for (const [name, entry] of history) {
    if (configured.has(name) || entry === null) {
      continue;
    }
    const removed = removedFiles(entry, [], foreignFiles(history, name));
    await gcCatalog(removed);
    await deleteHistory(name);
    history.delete(name);
    orphans.push({ name, files: removed.length });
    console.log(`  ${name}: no longer in sources.yaml, removed ${removed.length} catalog file(s)`);
  }
  return orphans;
}

/** Includes stderr from failed shell commands (Bun ShellError) when present. */
function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }
  const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
  return stderr ? `${err.message}\n${stderr.split("\n").slice(-5).join("\n")}` : err.message;
}

async function main(): Promise<number> {
  const parseOptions = {
    source: { type: "string" },
    force: { type: "boolean", default: false },
    summary: { type: "string" },
    concurrent: { type: "string" },
    "run-to-completion": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  } as const;
  let parsed: ReturnType<typeof parseArgs<{ options: typeof parseOptions; allowPositionals: true }>>;
  try {
    parsed = parseArgs({
      args: Bun.argv.slice(2),
      options: parseOptions,
      allowPositionals: true,
    });
  } catch (err) {
    console.error(`error: ${errorMessage(err)}\n\n${USAGE}`);
    return 1;
  }
  const { values, positionals } = parsed;

  const command = positionals[0];
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (command !== "build" && command !== "regen") {
    console.error(command === undefined ? USAGE : `error: unknown command '${command}'\n\n${USAGE}`);
    return 1;
  }
  let concurrent: number;
  try {
    concurrent = parsePositiveIntegerFlag("--concurrent", values.concurrent, 2);
  } catch (err) {
    console.error(`error: ${errorMessage(err)}`);
    return 1;
  }

  const { sources: allSources } = await loadConfig(SOURCES_PATH);
  let sources = allSources;
  if (values.source !== undefined) {
    sources = sources.filter((s) => s.name === values.source);
    if (sources.length === 0) {
      console.error(`error: source '${values.source}' not found in ${SOURCES_PATH}`);
      return 1;
    }
  }

  // Preload every manifest once: it backs skip detection, cross-source
  // ownership checks, orphan GC and the README table. A corrupt manifest is
  // dropped so the source self-heals by rebuilding from scratch.
  const history = new Map<string, HistoryEntry | null>();
  for (const name of new Set([...allSources.map((s) => s.name), ...(await listHistoryNames())])) {
    try {
      history.set(name, await readHistory(name));
    } catch (err) {
      console.error(`  ${name}: ignoring corrupt history manifest: ${errorMessage(err)}`);
      history.set(name, null);
    }
  }

  const opts: Options = { command, force: values.force, toolVersion: await fluxSchemaVersion() };
  console.log(`${command}: ${sources.length} source(s), flux-schema ${opts.toolVersion}`);

  const failures: SourceFailure[] = [];
  const changes: BuildChange[] = [];
  let upToDate = 0;
  const results = await runBoundedPool(sources, concurrent, (source) => processSource(source, opts, history));
  for (const result of results) {
    if ("error" in result) {
      const message = errorMessage(result.error);
      failures.push({ name: result.item.name, message });
      console.error(`  ${result.item.name}: error: ${message}`);
    } else {
      const change = result.value;
      change !== null ? changes.push(change) : upToDate++;
    }
  }

  let orphans: OrphanRemoval[] = [];
  if (command === "build" && values.source === undefined) {
    orphans = await gcOrphanedSources(new Set(allSources.map((s) => s.name)), history);
  }

  const tracked = allSources
    .map((s) => ({ source: s, entry: history.get(s.name) }))
    .filter((x): x is { source: Source; entry: HistoryEntry } => x.entry != null);
  const rows = tracked.map(({ source, entry }) => ({
    alias: source.alias,
    category: source.category,
    name: entry.name,
    version: displayVersion(entry.version),
    builtAt: entry.builtAt,
    schemas: entry.files.filter((f) => f.endsWith(".json")).length,
  }));
  let totalBytes = 0;
  for (const { entry } of tracked) {
    for (const file of entry.files) {
      totalBytes += Bun.file(join(ROOT_DIR, file)).size;
    }
  }
  const sizeMB = Math.round(totalBytes / 1024 / 1024);
  // The stats badge counts presented projects: grouped sources collapse into
  // their project group in the web UI and MCP, so they count once here too.
  const groupKeys = new Set(tracked.flatMap(({ source }) => (source.project === undefined ? [] : [source.project])));
  const projectCount = tracked.filter(({ source }) => source.project === undefined).length + groupKeys.size;
  if (rows.length > 0 && (await updateReadme(README_PATH, rows, sizeMB, projectCount))) {
    console.log("  README.md: versions table updated");
  }

  if (values.summary !== undefined) {
    const reported = values["run-to-completion"] ? failures : [];
    await Bun.write(values.summary, renderBuildSummary(changes, orphans, upToDate, reported));
    console.log(`  summary written to ${values.summary}`);
  }

  // Tell the CI workflow whether a pull request is warranted; the build is
  // the only party that knows if this run changed the catalog.
  if (process.env.GITHUB_OUTPUT) {
    const changed = changes.length > 0 || orphans.length > 0;
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
    console.log(`  GitHub output: changed=${changed}`);
  }

  if (failures.length > 0) {
    const names = failures.map((f) => f.name).join(", ");
    console.error(`\nerror: ${failures.length} source(s) failed: ${names}`);
    // --run-to-completion (CI) keeps the run green so the successful sources
    // still ship a PR; the failures are surfaced in its body instead.
    if (!values["run-to-completion"]) {
      return 1;
    }
  }
  return 0;
}

process.exitCode = await main();
