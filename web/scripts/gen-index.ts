// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, loadConfig, repoOf, repoOfProject } from "../../build/src/config.ts";
import { listHistoryNames, readHistory } from "../../build/src/history.ts";
import { displayVersion } from "../../build/src/resolve.ts";
import type { CatalogConfig, HistoryEntry, ResourceNames, Source } from "../../build/src/types.ts";
import { compareApiVersion, pluralResourceName } from "../src/shared/index-query.ts";
import type { CatalogIndex, GroupEntry, KindEntry, ProjectEntry, ResourceEntry } from "../src/shared/types.ts";

/**
 * Catalog path contract recorded in build history manifests. Non-conforming
 * paths fail index generation instead of being ignored, because the generated
 * index is the Worker/UI/MCP source of truth for all served schemas.
 */
const FILE_RE = /^catalog\/([a-z0-9.-]+)\/([a-z0-9.-]+)_([a-z0-9]+)\.(json|fields\.txt)$/;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "../..");

/** Accumulates schema versions and available field indexes for one lowercase kind. */
interface KindBuild {
  versions: Set<string>;
  fields: Set<string>;
  /** Index of the contributing member manifest; the build's cross-source ownership guard makes it unique. */
  owner: number;
}

/** One source joined with its history manifest. */
interface TrackedSource {
  source: Source;
  entry: HistoryEntry;
}

/**
 * Generates the compact web index by joining configured sources with build
 * history manifests. Sources without history and histories without sources are
 * skipped with warnings; unknown categories or invalid catalog file paths throw
 * because they would make UI and MCP output inconsistent with the catalog tree.
 * Sources referencing a project group merge into one grouped entry carrying a
 * `sources` member list instead of a `version`.
 */
export function generateIndex(config: CatalogConfig, entries: HistoryEntry[]): CatalogIndex {
  const sourcesByName = new Map(config.sources.map((source) => [source.name, source]));
  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const membersByProject = new Map<string, TrackedSource[]>();
  const projects: ProjectEntry[] = [];

  for (const entry of entries) {
    if (!sourcesByName.has(entry.name)) {
      console.warn(`warning: skipping history manifest without source: ${entry.name}`);
    }
  }
  for (const source of config.sources) {
    const entry = entriesByName.get(source.name);
    if (entry === undefined) {
      const member = source.project === undefined ? "" : ` (member of project ${source.project})`;
      console.warn(`warning: skipping source without history manifest: ${source.name}${member}`);
      continue;
    }
    if (source.project !== undefined) {
      const members = membersByProject.get(source.project) ?? [];
      members.push({ source, entry });
      membersByProject.set(source.project, members);
      continue;
    }

    const version = displayVersion(entry.version);
    projects.push({
      name: source.name,
      alias: source.alias,
      cat: categoryIndex(source.category, `source ${source.name}`),
      repo: repoOf(source),
      version,
      ...(version === entry.version ? {} : { ref: entry.version }),
      ...(entry.commit === undefined ? {} : { sha: entry.commit.slice(0, 12) }),
      builtAt: entry.builtAt.slice(0, 10),
      ...(source.cncf === undefined ? {} : { cncf: source.cncf }),
      ...(source.pin === undefined ? {} : { pin: source.pin }),
      groups: collectGroups([entry]),
    });
  }

  for (const project of config.projects) {
    // Alias-sorted up front: the `sources` array and the per-kind `src` owner
    // indexes emitted by collectGroups must agree on member order.
    const members = (membersByProject.get(project.name) ?? []).sort((a, b) =>
      a.source.alias.localeCompare(b.source.alias),
    );
    if (members.length === 0) {
      console.warn(`warning: skipping project without member history manifests: ${project.name}`);
      continue;
    }
    const builtAt = members.reduce((max, { entry }) => (entry.builtAt > max ? entry.builtAt : max), "");
    projects.push({
      name: project.name,
      alias: project.alias,
      cat: categoryIndex(project.category, `project ${project.name}`),
      repo: repoOfProject(project),
      builtAt: builtAt.slice(0, 10),
      ...(project.cncf === undefined ? {} : { cncf: project.cncf }),
      ...(project.pin === undefined ? {} : { pin: project.pin }),
      sources: members.map(({ source, entry }) => ({
        name: source.name,
        alias: source.alias,
        repo: repoOf(source),
        version: displayVersion(entry.version),
        ...(displayVersion(entry.version) === entry.version ? {} : { ref: entry.version }),
        ...(entry.commit === undefined ? {} : { sha: entry.commit.slice(0, 12) }),
        builtAt: entry.builtAt.slice(0, 10),
      })),
      groups: collectGroups(members.map(({ entry }) => entry), true),
    });
  }

  return {
    v: 4,
    generatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    projects: projects.sort((a, b) => a.alias.localeCompare(b.alias)),
  };
}

function categoryIndex(category: string, owner: string): number {
  const cat = CATEGORIES.indexOf(category as (typeof CATEGORIES)[number]);
  if (cat === -1) {
    throw new Error(`unknown category for ${owner}: ${category}`);
  }
  return cat;
}

if (import.meta.main) {
  const config = await loadConfig(join(repoRoot, "build/config/sources.yaml"));
  const entries = (await Promise.all((await listHistoryNames()).map((name) => readHistory(name)))).filter(
    (entry): entry is HistoryEntry => entry !== null,
  );
  const index = generateIndex(config, entries);
  const outputPath = join(repoRoot, "web/dist/assets/index.json");
  const json = JSON.stringify(index);

  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, json);

  const groups = index.projects.reduce((sum, project) => sum + project.groups.length, 0);
  const kinds = new Set(index.projects.flatMap((project) => project.groups.flatMap((group) => group.kinds.map((kind) => kind[0]))))
    .size;
  const bytes = new TextEncoder().encode(json).byteLength;
  console.log(`${index.projects.length} projects, ${groups} groups, ${kinds} kinds, ${bytes} bytes`);
}

function compactResource(kind: string, names: ResourceNames | undefined): ResourceEntry | undefined {
  if (names === undefined) {
    return undefined;
  }
  const out: ResourceEntry = {};
  const singular = normalizedName(names.singular);
  const plural = normalizedName(names.plural);
  if (singular !== undefined && singular !== kind) {
    out.s = singular;
  }
  if (plural !== undefined && plural !== pluralResourceName(kind)) {
    out.p = plural;
  }

  const redundant = new Set([kind, singular, plural].filter((value): value is string => value !== undefined));
  const shortNames: string[] = [];
  const seen = new Set<string>();
  for (const name of names.shortNames ?? []) {
    const normalized = normalizedName(name);
    if (normalized === undefined || redundant.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    shortNames.push(normalized);
  }
  if (shortNames.length > 0) {
    out.n = shortNames;
  }

  return Object.keys(out).length === 0 ? undefined : out;
}

function normalizedName(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === undefined || normalized === "" ? undefined : normalized;
}

/**
 * Collects the API group entries across one or more history manifests: grouped
 * projects pass their member manifests, whose kinds merge under shared API
 * groups (e.g. both KServe sources contribute to `serving.kserve.io`).
 * `attributeSources` additionally emits `src`, the owning-member index per
 * kind, matching the order of the entries passed in.
 */
function collectGroups(entries: HistoryEntry[], attributeSources = false): GroupEntry[] {
  const groups = new Map<string, Map<string, KindBuild>>();
  // Recover the original casing recorded by the build: `<group>/<Kind>` keyed by
  // its lowercase `<group>/<slug>` so it joins back to catalog filenames.
  const casing = new Map<string, string>();
  const resources = new Map<string, ResourceNames>();
  for (const entry of entries) {
    for (const [id, names] of Object.entries(entry.kinds ?? {})) {
      casing.set(id.toLowerCase(), id.slice(id.indexOf("/") + 1));
      resources.set(id.toLowerCase(), names);
    }
  }

  for (const [entryIndex, entry] of entries.entries()) {
    const badPaths: string[] = [];
    for (const file of entry.files) {
      const match = file.match(FILE_RE);
      if (match === null) {
        badPaths.push(file);
        continue;
      }

      const group = match[1]!;
      const kind = match[2]!;
      const version = match[3]!;
      const ext = match[4]!;
      let kinds = groups.get(group);
      if (kinds === undefined) {
        kinds = new Map();
        groups.set(group, kinds);
      }
      let build = kinds.get(kind);
      if (build === undefined) {
        build = { versions: new Set(), fields: new Set(), owner: entryIndex };
        kinds.set(kind, build);
      }
      if (ext === "json") {
        build.versions.add(version);
      } else {
        build.fields.add(version);
      }
    }

    if (badPaths.length > 0) {
      throw new Error(`invalid catalog file paths in ${entry.name}: ${badPaths.join(", ")}`);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, kinds]) => {
      const sorted = [...kinds.entries()].sort(([a], [b]) => a.localeCompare(b));
      const groupEntry: GroupEntry = {
        g,
        kinds: sorted.map(([kind, build]): KindEntry => {
          const versions = [...build.versions].sort(compareApiVersion);
          let fieldsBits = 0;
          versions.forEach((version, i) => {
            if (build.fields.has(version)) {
              fieldsBits |= 1 << i;
            }
          });
          const display = casing.get(`${g}/${kind}`);
          const resource = compactResource(kind, resources.get(`${g}/${display ?? kind}`.toLowerCase()));
          if (resource !== undefined) {
            return [kind, versions, fieldsBits, display ?? kind, resource];
          }
          return display === undefined || display === kind
            ? [kind, versions, fieldsBits]
            : [kind, versions, fieldsBits, display];
        }),
      };
      // Grouped projects carry the owning member per kind so the UI and MCP
      // can attribute a schema to its source and version.
      if (attributeSources) {
        groupEntry.src = sorted.map(([, build]) => build.owner);
      }
      return groupEntry;
    });
}
