// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { filterFieldLines, parseFieldsFile } from "../shared/fields.ts";
import { latestVersion, searchIndex } from "../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../shared/types.ts";
import type { Env } from "./index.ts";

/** Public base URL for catalog objects returned by MCP tools and error messages. */
export const CATALOG_BASE_URL = "https://schemas.fluxoperator.dev/catalog";

/**
 * Maximum schema body size returned inline by `get_schema`, in bytes. Larger
 * objects return a direct URL plus `search_fields` guidance to keep MCP
 * responses bounded and avoid loading large schemas into agent context.
 */
export const MAX_SCHEMA_INLINE_BYTES = 262_144;

/** CNCF category filter values exposed to the `list_projects` MCP tool. */
export const CNCF_CATEGORIES = [
  "Provisioning",
  "Runtime",
  "Orchestration & Management",
  "App Definition & Development",
  "Observability & Analysis",
  "Platform",
] as const;

/**
 * Catalog object stream plus metadata used by MCP helpers. `size` is nullable
 * because local development HTTP responses may omit `Content-Length`.
 */
export interface CatalogObject {
  body: ReadableStream;
  etag: string;
  size: number | null;
}

/**
 * Dependency-injected catalog loader. Production passes `getCatalogObject`;
 * tests pass in-memory loaders so MCP helper behavior stays pure and
 * deterministic.
 */
export type CatalogObjectLoader = (env: Env, key: string) => Promise<CatalogObject | null>;

/** Input for resolving and returning one JSON schema through the MCP layer. */
export interface GetSchemaInput {
  group: string;
  kind: string;
  version?: string;
}

/**
 * Input for searching a `.fields.txt` index. `limit` is the post-filter cap and
 * is validated by the MCP schema before reaching these helpers.
 */
export interface SearchFieldsInput {
  group: string;
  kind: string;
  version?: string;
  query?: string;
  prefix?: string;
  limit: number;
}

/** Compact `search_catalog` result with the latest schema URL precomputed. */
export interface SearchCatalogResult {
  project: string;
  alias: string;
  group: string;
  kind: string;
  versions: string[];
  hasFields: boolean;
  schemaUrl: string;
}

/** One row returned by `list_projects`, with kind count but no per-kind detail. */
export interface ProjectSummary {
  name: string;
  alias: string;
  category: string;
  version: string;
  repo: string;
  builtAt: string;
  kinds: number;
}

/** Full project detail returned by `get_project`, including per-version fields availability. */
export interface ProjectDetails {
  name: string;
  alias: string;
  category: string;
  version: string;
  repo: string;
  builtAt: string;
  groups: Array<{
    group: string;
    kinds: Array<{
      kind: string;
      versions: Array<{ version: string; hasFields: boolean }>;
    }>;
  }>;
}

/** Canonical group/kind match resolved from case-insensitive MCP input. */
export interface ResolvedKind {
  project: ProjectEntry;
  group: string;
  entry: KindEntry;
}

/**
 * Builds MCP-facing search results from ranked index hits. `hasFields` reports
 * only the latest/preferred version because the returned `schemaUrl` also points
 * at `versions[0]`.
 */
export function buildSearchResults(index: CatalogIndex, query: string, limit = 20): SearchCatalogResult[] {
  return searchIndex(index, query, limit).map((hit) => {
    const latest = hit.versions[0] ?? "";
    return {
      project: hit.project,
      alias: hit.alias,
      group: hit.group,
      kind: hit.kind,
      versions: hit.versions,
      hasFields: hasFieldsAtVersion(hit.fieldsBits, 0),
      schemaUrl: schemaUrl(hit.group, hit.kind, latest),
    };
  });
}

/**
 * Lists project summaries in index order, optionally matching the display
 * category name exactly. Unknown categories simply produce an empty list because
 * the MCP input schema normally rejects invalid category values first.
 */
export function listProjectSummaries(index: CatalogIndex, category?: string): ProjectSummary[] {
  return index.projects
    .filter((project) => category === undefined || categoryName(index, project) === category)
    .map((project) => ({
      name: project.name,
      alias: project.alias,
      category: categoryName(index, project),
      version: project.version,
      repo: project.repo,
      builtAt: project.builtAt,
      kinds: kindCount(project),
    }));
}

/**
 * Finds a project by config name or display alias using case-insensitive
 * normalized comparison. This lets MCP clients pass either stable source names
 * such as `fluxcd` or user-facing aliases such as `Flux CD`.
 */
export function findProject(index: CatalogIndex, value: string): ProjectEntry | undefined {
  const needle = normalize(value);
  return index.projects.find((project) => normalize(project.name) === needle || normalize(project.alias) === needle);
}

/**
 * Expands a compact project entry into the `get_project` response contract. The
 * `hasFields` value for each version is decoded from bit `i` of `fieldsBits`,
 * where `i` is the version's index in the sorted `versions` array.
 */
export function projectDetails(index: CatalogIndex, project: ProjectEntry): ProjectDetails {
  return {
    name: project.name,
    alias: project.alias,
    category: categoryName(index, project),
    version: project.version,
    repo: project.repo,
    builtAt: project.builtAt,
    groups: project.groups.map((group) => ({
      group: group.g,
      kinds: group.kinds.map((entry) => ({
        kind: entry[0],
        versions: entry[1].map((version, index) => ({
          version,
          hasFields: hasFieldsAtVersion(entry[2], index),
        })),
      })),
    })),
  };
}

/**
 * Formats a project-not-found message with close suggestions. This returns text
 * rather than throwing so MCP tools can surface useful guidance as a normal tool
 * response.
 */
export function projectNotFoundMessage(index: CatalogIndex, project: string): string {
  const matches = closeProjectMatches(index, project);
  const suffix =
    matches.length === 0 ? "" : ` Did you mean: ${matches.map((match) => `${match.alias} (${match.name})`).join(", ")}?`;
  return `Project "${project}" was not found by name or alias.${suffix}`;
}

/**
 * Resolves a group/kind pair using case-insensitive input and returns the
 * canonical lowercase group and kind from the generated index. Catalog filenames
 * are lowercase, so downstream object keys must use this canonical spelling.
 */
export function resolveKind(index: CatalogIndex, group: string, kind: string): ResolvedKind | undefined {
  const normalizedGroup = normalize(group);
  const normalizedKind = normalize(kind);

  for (const project of index.projects) {
    const groupEntry = project.groups.find((candidate) => normalize(candidate.g) === normalizedGroup);
    const kindEntry = groupEntry?.kinds.find((candidate) => normalize(candidate[0]) === normalizedKind);
    if (groupEntry !== undefined && kindEntry !== undefined) {
      return { project, group: groupEntry.g, entry: kindEntry };
    }
  }

  return undefined;
}

/**
 * Formats a kind-not-found message with nearby kinds, prioritizing matches in
 * the requested group before cross-group suggestions.
 */
export function kindNotFoundMessage(index: CatalogIndex, group: string, kind: string): string {
  const candidates = closeKindMatches(index, group, kind);
  const suffix =
    candidates.length === 0
      ? ""
      : ` Close matches: ${candidates.map((candidate) => `${candidate.group}/${candidate.kind}`).join(", ")}.`;
  return `Kind "${group}/${kind}" was not found in the catalog.${suffix}`;
}

/**
 * Resolves an optional version request against a kind entry. Empty or omitted
 * versions select `versions[0]`, which is the preferred/latest version sorted by
 * Kubernetes API priority during index generation.
 */
export function resolveVersion(entry: KindEntry, requested?: string): string | undefined {
  if (requested === undefined || requested === "") {
    return latestVersion(entry);
  }
  return entry[1].find((version) => normalize(version) === normalize(requested));
}

/** Returns a human-readable version miss that includes all available versions. */
export function versionNotFoundMessage(group: string, entry: KindEntry, version: string): string {
  return `Version "${version}" is not available for "${group}/${entry[0]}". Available versions: ${entry[1].join(", ")}.`;
}

/**
 * Returns a refusal message when a schema exceeds `MAX_SCHEMA_INLINE_BYTES`.
 * `null` size is treated as unknown and allowed so local dev responses without
 * `Content-Length` can still be inspected.
 */
export function sizeGuardText(group: string, kind: string, version: string, size: number | null): string | undefined {
  if (size === null || size <= MAX_SCHEMA_INLINE_BYTES) {
    return undefined;
  }

  const url = schemaUrl(group, kind, version);
  return (
    `Schema "${group}/${kind}_${version}.json" is ${size} bytes, which exceeds the ${MAX_SCHEMA_INLINE_BYTES} byte inline response limit. ` +
    `Open it directly at ${url}, or use search_fields for targeted field lookup.`
  );
}

/**
 * Formats a filtered `.fields.txt` response for MCP clients. Matching lines are
 * returned unchanged, followed by a footer with the untruncated match count and
 * total field count.
 */
export function formatFieldsResponse(text: string, opts: { query?: string; prefix?: string; limit: number }): string {
  const lines = parseFieldsFile(text);
  const filtered = filterFieldLines(lines, opts);
  return [...filtered.matches.map((line) => line.raw), `-- matched ${filtered.total} of ${lines.length} fields`].join("\n");
}

/**
 * Builds the public URL for a JSON schema object. Inputs should be canonical
 * lowercase group/kind/version values from the generated index; each path
 * segment is still encoded for safety.
 */
export function schemaUrl(group: string, kind: string, version: string): string {
  return `${CATALOG_BASE_URL}/${encodeURIComponent(group)}/${encodeURIComponent(kind)}_${encodeURIComponent(version)}.json`;
}

/**
 * Decodes the `fieldsBits` bitmap for a version index. Bit `0` corresponds to
 * `versions[0]`, bit `1` to `versions[1]`, and so on.
 */
export function hasFieldsAtVersion(fieldsBits: number, versionIndex: number): boolean {
  return (fieldsBits & (1 << versionIndex)) !== 0;
}

/**
 * Resolves and returns a schema body for `get_schema`. Missing kinds, versions,
 * objects, and over-limit bodies are reported as text responses instead of
 * thrown errors so agents receive actionable messages.
 */
export async function getSchemaText(
  index: CatalogIndex,
  env: Env,
  input: GetSchemaInput,
  loader: CatalogObjectLoader,
): Promise<string> {
  const resolved = resolveKind(index, input.group, input.kind);
  if (resolved === undefined) {
    return kindNotFoundMessage(index, input.group, input.kind);
  }

  const version = resolveVersion(resolved.entry, input.version);
  if (version === undefined) {
    return versionNotFoundMessage(resolved.group, resolved.entry, input.version ?? "");
  }

  const obj = await loader(env, catalogKey(resolved.group, resolved.entry[0], version, "json"));
  if (obj === null) {
    return `Schema "${resolved.group}/${resolved.entry[0]}_${version}.json" was not found at ${schemaUrl(resolved.group, resolved.entry[0], version)}.`;
  }

  const guard = sizeGuardText(resolved.group, resolved.entry[0], version, obj.size);
  if (guard !== undefined) {
    return guard;
  }

  return await new Response(obj.body).text();
}

/**
 * Resolves and searches a `.fields.txt` object for `search_fields`. If the index
 * says no fields file exists for the selected version, the loader is not called
 * and the response points clients at the JSON schema instead.
 */
export async function searchFieldsText(
  index: CatalogIndex,
  env: Env,
  input: SearchFieldsInput,
  loader: CatalogObjectLoader,
): Promise<string> {
  const resolved = resolveKind(index, input.group, input.kind);
  if (resolved === undefined) {
    return kindNotFoundMessage(index, input.group, input.kind);
  }

  const version = resolveVersion(resolved.entry, input.version);
  if (version === undefined) {
    return versionNotFoundMessage(resolved.group, resolved.entry, input.version ?? "");
  }

  const versionIndex = resolved.entry[1].indexOf(version);
  const url = schemaUrl(resolved.group, resolved.entry[0], version);
  if (!hasFieldsAtVersion(resolved.entry[2], versionIndex)) {
    return `No fields index is available for "${resolved.group}/${resolved.entry[0]}_${version}.fields.txt". Use the JSON schema directly: ${url}`;
  }

  const obj = await loader(env, catalogKey(resolved.group, resolved.entry[0], version, "fields.txt"));
  if (obj === null) {
    return `Fields index "${resolved.group}/${resolved.entry[0]}_${version}.fields.txt" was not found. Use the JSON schema directly: ${url}`;
  }

  const text = await new Response(obj.body).text();
  return formatFieldsResponse(text, { query: input.query, prefix: input.prefix, limit: input.limit });
}

function categoryName(index: CatalogIndex, project: ProjectEntry): string {
  return index.categories[project.cat] ?? "Uncategorized";
}

function kindCount(project: ProjectEntry): number {
  return project.groups.reduce((total, group) => total + group.kinds.length, 0);
}

function catalogKey(group: string, kind: string, version: string, suffix: "json" | "fields.txt"): string {
  return `${group}/${kind}_${version}.${suffix}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function closeProjectMatches(index: CatalogIndex, value: string): ProjectEntry[] {
  const needle = normalize(value);
  return index.projects
    .map((project) => ({
      project,
      score: Math.min(distance(needle, normalize(project.name)), distance(needle, normalize(project.alias))),
      includes: normalize(project.name).includes(needle) || normalize(project.alias).includes(needle),
    }))
    .sort((a, b) => {
      if (a.includes !== b.includes) {
        return a.includes ? -1 : 1;
      }
      return a.score - b.score || a.project.alias.localeCompare(b.project.alias);
    })
    .slice(0, 5)
    .map((entry) => entry.project);
}

function closeKindMatches(index: CatalogIndex, group: string, kind: string): Array<{ group: string; kind: string }> {
  const normalizedGroup = normalize(group);
  const normalizedKind = normalize(kind);
  const candidates: Array<{ group: string; kind: string; score: number; sameGroup: boolean; includes: boolean }> = [];

  for (const project of index.projects) {
    for (const groupEntry of project.groups) {
      const sameGroup = normalize(groupEntry.g) === normalizedGroup;
      for (const entry of groupEntry.kinds) {
        const entryKind = normalize(entry[0]);
        candidates.push({
          group: groupEntry.g,
          kind: entry[0],
          score: distance(normalizedKind, entryKind),
          sameGroup,
          includes: entryKind.includes(normalizedKind),
        });
      }
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.sameGroup !== b.sameGroup) {
        return a.sameGroup ? -1 : 1;
      }
      if (a.includes !== b.includes) {
        return a.includes ? -1 : 1;
      }
      return a.score - b.score || a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group);
    })
    .slice(0, 5)
    .map(({ group, kind }) => ({ group, kind }));
}

function distance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }
    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[b.length]!;
}
