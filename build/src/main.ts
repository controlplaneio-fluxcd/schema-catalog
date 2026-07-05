import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadSources, repoOf } from "./config.ts";
import { extractSource, fluxSchemaVersion } from "./extract.ts";
import {
  deleteHistory,
  gcCatalog,
  historyFilesPresent,
  listHistoryNames,
  listStagedFiles,
  readHistory,
  removedFiles,
  syncCatalog,
  writeHistory,
} from "./history.ts";
import { README_PATH, SOURCES_PATH } from "./paths.ts";
import { updateReadme } from "./readme.ts";
import { resolveVersion } from "./resolve.ts";
import { renderBuildSummary } from "./summary.ts";
import type { BuildChange, OrphanRemoval } from "./summary.ts";
import type { HistoryEntry, Source } from "./types.ts";

const USAGE = `Usage: bun run <command> [options]

Commands:
  build   Resolve versions, extract schemas, GC and update history
  regen   Rebuild the catalog at the versions pinned in build/history

Options:
  --source <name>   Process a single source from build/sources.yaml
  --force           Rebuild even when the resolved version is unchanged
  --summary <path>  Write a markdown summary of the changes (for PR bodies)
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
        console.log(`  ${source.name}: ${version} is up to date, skipped`);
        return null;
      }
      console.log(`  ${source.name}: ${version} has missing catalog files, rebuilding`);
    }
  }

  const foreign = foreignFiles(history, source.name);
  const staging = await mkdtemp(join(tmpdir(), `schema-catalog-${source.name}-`));
  try {
    await extractSource(source, version, staging);
    const staged = await listStagedFiles(staging);
    if (staged.length === 0) {
      throw new Error(`extraction at ${version} produced no files`);
    }
    const conflicts = staged.map((rel) => join("catalog", rel)).filter((f) => foreign.has(f));
    if (conflicts.length > 0) {
      const owner = [...history].find(([, e]) => e?.files.includes(conflicts[0]!))?.[0];
      throw new Error(
        `refusing to overwrite ${conflicts.length} file(s) owned by source '${owner}',` +
          ` e.g. ${conflicts[0]}`,
      );
    }
    const files = await syncCatalog(staging, staged);
    const removed = removedFiles(prev, files, foreign);
    await gcCatalog(removed);
    const entry: HistoryEntry = {
      name: source.name,
      repo: repoOf(source),
      version,
      builtAt: new Date().toISOString(),
      fluxSchemaVersion: opts.toolVersion,
      files,
    };
    await writeHistory(entry);
    history.set(source.name, entry);
    const prevSet = new Set(prev?.files ?? []);
    const added = files.filter((f) => !prevSet.has(f)).length;
    console.log(
      `  ${source.name}: ${prev?.version ?? "none"} -> ${version},` +
        ` ${files.length} files (+${added} -${removed.length})`,
    );
    return {
      repo: entry.repo,
      prevVersion: prev?.version ?? null,
      version,
      files: files.length,
      added,
      removed: removed.length,
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
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      force: { type: "boolean", default: false },
      summary: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const command = positionals[0];
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (command !== "build" && command !== "regen") {
    console.error(command === undefined ? USAGE : `error: unknown command '${command}'\n\n${USAGE}`);
    return 1;
  }

  const allSources = await loadSources(SOURCES_PATH);
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

  const failures: string[] = [];
  const changes: BuildChange[] = [];
  let upToDate = 0;
  for (const source of sources) {
    try {
      const change = await processSource(source, opts, history);
      change !== null ? changes.push(change) : upToDate++;
    } catch (err) {
      failures.push(source.name);
      console.error(`  ${source.name}: error: ${errorMessage(err)}`);
    }
  }

  let orphans: OrphanRemoval[] = [];
  if (command === "build" && values.source === undefined) {
    orphans = await gcOrphanedSources(new Set(allSources.map((s) => s.name)), history);
  }

  const rows = allSources
    .map((s) => ({ source: s, entry: history.get(s.name) }))
    .filter((x): x is { source: Source; entry: HistoryEntry } => x.entry != null)
    .map(({ source, entry }) => ({
      alias: source.alias,
      name: entry.name,
      version: entry.version,
      builtAt: entry.builtAt,
    }));
  if (rows.length > 0 && (await updateReadme(README_PATH, rows))) {
    console.log("  README.md: versions table updated");
  }

  if (values.summary !== undefined) {
    await Bun.write(values.summary, renderBuildSummary(changes, orphans, upToDate));
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
    console.error(`\nerror: ${failures.length} source(s) failed: ${failures.join(", ")}`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
