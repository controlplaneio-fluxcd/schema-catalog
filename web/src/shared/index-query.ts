import type { CatalogIndex, KindEntry, ProjectEntry } from "./types.ts";

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
  kind: string;
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
    const projectText = `${project.alias} ${project.name}`.toLowerCase();
    for (const group of project.groups) {
      const groupText = group.g.toLowerCase();
      for (const entry of group.kinds) {
        const kindText = entry[0].toLowerCase();
        const score = scoreMatch(kindText, groupText, projectText, needle);
        if (score === 0) {
          continue;
        }

        hits.push({
          project: project.name,
          alias: project.alias,
          group: group.g,
          kind: entry[0],
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
): { project: ProjectEntry; entry: KindEntry } | undefined {
  for (const project of index.projects) {
    const groupEntry = project.groups.find((candidate) => candidate.g === group);
    const kindEntry = groupEntry?.kinds.find((candidate) => candidate[0] === kind);
    if (kindEntry !== undefined) {
      return { project, entry: kindEntry };
    }
  }
  return undefined;
}

function scoreMatch(kind: string, group: string, project: string, needle: string): number {
  if (kind.startsWith(needle)) {
    return 4;
  }
  if (kind.includes(needle)) {
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
