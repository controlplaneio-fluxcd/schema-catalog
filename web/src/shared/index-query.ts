// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex, GroupEntry, KindEntry, ProjectEntry, ProjectSourceEntry } from "./types.ts";

interface ParsedApiVersion {
  original: string;
  major: number;
  stability: 0 | 1 | 2;
  seq: number;
}

/**
 * Ranked catalog search result. `fieldsBits` keeps the same bit-to-version
 * mapping as the source `KindEntry`, so callers must check bit `i` against
 * `versions[i]` rather than treating it as a total or boolean.
 */
export interface SearchHit {
  project: string;
  alias: string;
  group: string;
  /** Lowercase catalog slug; use for routes and object paths. */
  kind: string;
  /** Original-cased kind name for display text. */
  display: string;
  versions: string[];
  fieldsBits: number;
  score: number;
}

/**
 * Sorts Kubernetes API versions by serving priority: stable before beta before
 * alpha, higher major versions before lower, then higher prerelease sequence
 * before lower. Non-conforming versions sort after Kubernetes-looking versions,
 * newest-first lexically (Azure Service Operator's date-based `v1api<YYYYMMDD>`
 * forms), with a bare version ahead of its suffixed variants so
 * `v1api20230401` beats the internal `v1api20230401storage` hub version.
 */
export function compareApiVersion(a: string, b: string): number {
  const aa = parseApiVersion(a);
  const bb = parseApiVersion(b);

  if (aa === undefined || bb === undefined) {
    if (aa !== undefined) {
      return -1;
    }
    if (bb !== undefined) {
      return 1;
    }
    if (a.startsWith(b)) {
      return 1;
    }
    if (b.startsWith(a)) {
      return -1;
    }
    return b.localeCompare(a);
  }

  return (
    aa.stability - bb.stability ||
    bb.major - aa.major ||
    bb.seq - aa.seq ||
    aa.original.localeCompare(bb.original)
  );
}

/** Returns the preferred version from a `KindEntry`, or an empty string for an empty tuple. */
export function latestVersion(entry: KindEntry): string {
  return entry[1][0] ?? "";
}

/**
 * Decodes the `fieldsBits` bitmap for a version index. Bit `0` corresponds to
 * `versions[0]`, bit `1` to `versions[1]`, and so on.
 */
export function hasFieldsAtVersion(fieldsBits: number, versionIndex: number): boolean {
  return (fieldsBits & (1 << versionIndex)) !== 0;
}

/** Decodes whether the kind has a `.fields.txt` index at `versions[versionIndex]`. */
export function hasFields(entry: KindEntry, versionIndex: number): boolean {
  return hasFieldsAtVersion(entry[2], versionIndex);
}

/** Counts distinct kinds in a project, not schema versions. */
export function kindCount(project: ProjectEntry): number {
  return project.groups.reduce((total, group) => total + group.kinds.length, 0);
}

/** Counts schema versions in a project by summing each kind's version list. */
export function schemaCount(project: ProjectEntry): number {
  return project.groups.reduce(
    (total, group) => total + group.kinds.reduce((sum, entry) => sum + entry[1].length, 0),
    0,
  );
}

/** Returns the original-cased kind name for display, falling back to the slug. */
export function kindDisplay(entry: KindEntry): string {
  return entry[3] ?? entry[0];
}

/** Version badge text: the resolved version, or the member repo count for grouped projects. */
export function projectVersionLabel(project: ProjectEntry): string {
  return project.version ?? `${project.sources?.length ?? 0} repos`;
}

/** Returns normalized resource-reference aliases carried by the compact index. */
export function resourceAliases(entry: KindEntry): string[] {
  const aliases = new Set<string>();
  const add = (value: string | undefined): void => {
    const normalized = value?.trim().toLowerCase();
    if (normalized !== undefined && normalized !== "") {
      aliases.add(normalized);
    }
  };
  add(entry[0]);
  add(kindDisplay(entry));
  add(pluralResourceName(entry[0]));
  add(entry[4]?.s);
  add(entry[4]?.p);
  for (const name of entry[4]?.n ?? []) {
    add(name);
  }
  return [...aliases];
}

/**
 * Searches kind, group, project alias, and project name with simple deterministic
 * scoring. Empty queries and non-positive limits return no hits; results are
 * sorted by score and stable text tie-breakers before applying the limit.
 */
export function searchIndex(index: CatalogIndex, query: string, limit = 20): SearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle === "" || limit <= 0) {
    return [];
  }

  const hits: SearchHit[] = [];
  for (const project of index.projects) {
    // Grouped projects also match on their member names/aliases, so e.g.
    // "s3 controller" still surfaces the AWS Controllers for Kubernetes kinds.
    const projectText = [project.alias, project.name, ...(project.sources ?? []).flatMap((s) => [s.alias, s.name])]
      .join(" ")
      .toLowerCase();
    for (const group of project.groups) {
      const groupText = group.g.toLowerCase();
      for (const entry of group.kinds) {
        const kindText = entry[0].toLowerCase();
        const score = scoreMatch(kindText, groupText, projectText, needle, resourceAliases(entry));
        if (score === 0) {
          continue;
        }

        hits.push({
          project: project.name,
          alias: project.alias,
          group: group.g,
          kind: entry[0],
          display: kindDisplay(entry),
          versions: entry[1],
          fieldsBits: entry[2],
          score,
        });
      }
    }
  }

  return hits
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) {
        return byScore;
      }
      const byKind = a.kind.localeCompare(b.kind);
      if (byKind !== 0) {
        return byKind;
      }
      const byGroup = a.group.localeCompare(b.group);
      if (byGroup !== 0) {
        return byGroup;
      }
      return a.alias.localeCompare(b.alias);
    })
    .slice(0, limit);
}

/**
 * Finds an exact group/kind pair in the generated index. This is intentionally
 * case-sensitive for UI routes and generated catalog filenames; MCP lookup wraps
 * this with normalization for agent-friendly input.
 */
export function findKind(
  index: CatalogIndex,
  group: string,
  kind: string,
): { project: ProjectEntry; group: GroupEntry; entry: KindEntry } | undefined {
  for (const project of index.projects) {
    const groupEntry = project.groups.find((candidate) => candidate.g === group);
    const kindEntry = groupEntry?.kinds.find((candidate) => candidate[0] === kind);
    if (groupEntry !== undefined && kindEntry !== undefined) {
      return { project, group: groupEntry, entry: kindEntry };
    }
  }
  return undefined;
}

/**
 * Returns the member source a kind belongs to, resolved through the group's
 * per-kind `src` owner indexes. For single-source projects the project itself
 * is the source, so this returns undefined and callers fall back to it.
 */
export function kindSource(project: ProjectEntry, group: GroupEntry, entry: KindEntry): ProjectSourceEntry | undefined {
  if (project.sources === undefined || group.src === undefined) {
    return undefined;
  }
  const kindIndex = group.kinds.indexOf(entry);
  if (kindIndex === -1) {
    return undefined;
  }
  return project.sources[group.src[kindIndex] ?? -1];
}

function scoreMatch(kind: string, group: string, project: string, needle: string, aliases: string[]): number {
  if (kind.startsWith(needle) || aliases.some((alias) => alias.startsWith(needle))) {
    return 4;
  }
  if (kind.includes(needle) || aliases.some((alias) => alias.includes(needle))) {
    return 3;
  }
  if (group.includes(needle)) {
    return 2;
  }
  if (project.includes(needle)) {
    return 1;
  }
  return 0;
}

/**
 * Derives the default Kubernetes plural resource name. web/scripts/gen-index.ts
 * uses this to decide whether to omit compact `p` fields, so the deriver and
 * generator must stay in sync.
 */
export function pluralResourceName(kind: string): string {
  if (kind.endsWith("y") && kind.length > 1 && !isVowel(kind[kind.length - 2]!)) {
    return `${kind.slice(0, -1)}ies`;
  }
  if (["ch", "sh", "s", "x", "z"].some((suffix) => kind.endsWith(suffix))) {
    return `${kind}es`;
  }
  return `${kind}s`;
}

function isVowel(value: string): boolean {
  return value === "a" || value === "e" || value === "i" || value === "o" || value === "u";
}

function parseApiVersion(version: string): ParsedApiVersion | undefined {
  const match = version.match(/^v(\d+)(?:(alpha|beta)(\d+)?)?$/);
  if (match === null) {
    return undefined;
  }

  const major = Number(match[1]);
  const prerelease = match[2];
  const seq = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(seq)) {
    return undefined;
  }

  return {
    original: version,
    major,
    stability: prerelease === undefined ? 0 : prerelease === "beta" ? 1 : 2,
    seq,
  };
}
