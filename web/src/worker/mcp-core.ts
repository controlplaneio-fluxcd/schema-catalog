// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { filterFieldLines, parseFieldsFile } from "../shared/fields.ts";
import type { FieldLine } from "../shared/fields.ts";
import { kindDisplay, latestVersion } from "../shared/index-query.ts";
import type { CatalogIndex, KindEntry, ProjectEntry } from "../shared/types.ts";
import type { Env } from "./index.ts";

/** Public base URL for catalog objects returned by MCP tools and error messages. */
export const CATALOG_BASE_URL = "https://schemas.fluxoperator.dev/catalog";

/**
 * Maximum schema body size returned inline by `get_schema`, in bytes. Larger
 * objects return a direct URL plus `grep_schema` guidance to keep MCP
 * responses bounded and avoid loading large schemas into agent context.
 */
export const MAX_SCHEMA_INLINE_BYTES = 262_144;

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
  apiVersion: string;
  kind: string;
}

/**
 * Input for grepping a `.fields.txt` index. `limit` is the post-filter cap and
 * is validated by the MCP schema before reaching these helpers.
 */
export interface GrepSchemaInput {
  apiVersion: string;
  kind: string;
  query?: string;
  prefix?: string;
  limit: number;
}

/** Canonical group/kind match resolved from case-insensitive MCP input. */
export interface ResolvedKind {
  project: ProjectEntry;
  group: string;
  entry: KindEntry;
}

interface ParsedApiVersionInput {
  group: string;
  version?: string;
}

interface ResolvedSchemaTarget extends ResolvedKind {
  version: string;
  versionIndex: number;
}

/** Greps rendered TypeMeta-like catalog lines with a case-insensitive JavaScript RegExp. */
export function grepCatalogText(index: CatalogIndex, query: string, limit = 20): string {
  let regex: RegExp;
  try {
    regex = new RegExp(query, "i");
  } catch (error) {
    return invalidRegexMessage(query, error);
  }

  const lines = catalogLines(index);
  const matches = lines.filter((line) => regex.test(line));
  return [...matches.slice(0, limit), `# matched ${matches.length} of ${lines.length} schemas`].join("\n");
}

/** Formats project summaries as one greppable line per project, plus a metadata footer. */
export function listProjectsText(index: CatalogIndex): string {
  return [
    ...index.projects.map((project) => `${project.name} ${project.version} github.com/${project.repo} ${kindCount(project)} kinds`),
    `# ${index.projects.length} projects`,
  ].join("\n");
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

/** Formats one project's API surface as a header plus TypeMeta-like lines. */
export function projectText(project: ProjectEntry): string {
  return [`# ${project.name} ${project.version} github.com/${project.repo}`, ...projectCatalogLines(project)].join("\n");
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
      : ` Close matches: ${candidates.map((candidate) => `${candidate.apiVersion} ${candidate.kind}`).join(", ")}.`;
  return `Kind "${kind}" was not found for apiVersion selector "${group}".${suffix}`;
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
  return `apiVersion "${formatApiVersion(group, version)}" is not available for "${kindDisplay(entry)}". Available apiVersions: ${entry[1].map((candidate) => formatApiVersion(group, candidate)).join(", ")}.`;
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
    `Open it directly at ${url}, or use grep_schema for targeted field lookup.`
  );
}

/**
 * Formats a regex-filtered `.fields.txt` response for MCP clients. An optional
 * resolved-source header comes first (skipped on invalid-regex errors), then
 * matching lines unchanged, then a footer with the untruncated match count and
 * total field count.
 */
export function formatGrepSchemaResponse(
  text: string,
  opts: { query?: string; prefix?: string; limit: number; header?: string },
): string {
  const lines = parseFieldsFile(text);
  let filtered: { matches: FieldLine[]; total: number };
  try {
    filtered = filterFieldLines(lines, { ...opts, queryMode: "regex" });
  } catch (error) {
    if (opts.query !== undefined) {
      return invalidRegexMessage(opts.query, error);
    }
    throw error;
  }
  return [
    ...(opts.header === undefined ? [] : [opts.header]),
    ...filtered.matches.map((line) => line.raw),
    `# matched ${filtered.total} of ${lines.length} fields`,
  ].join("\n");
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
  const resolved = resolveSchemaTarget(index, input.apiVersion, input.kind);
  if (typeof resolved === "string") {
    return resolved;
  }

  const obj = await loader(env, catalogKey(resolved.group, resolved.entry[0], resolved.version, "json"));
  if (obj === null) {
    return `Schema "${resolved.group}/${resolved.entry[0]}_${resolved.version}.json" was not found at ${schemaUrl(resolved.group, resolved.entry[0], resolved.version)}.`;
  }

  const guard = sizeGuardText(resolved.group, resolved.entry[0], resolved.version, obj.size);
  if (guard !== undefined) {
    return guard;
  }

  return await new Response(obj.body).text();
}

/**
 * Resolves and searches a `.fields.txt` object for `grep_schema`. Successful
 * responses open with a `# <apiVersion> <Kind> from <project>` header so clients
 * see which schema version and source a bare-group input resolved to. If the
 * index says no fields file exists for the selected version, the loader is not
 * called and the response points clients at the JSON schema instead.
 */
export async function grepSchemaText(
  index: CatalogIndex,
  env: Env,
  input: GrepSchemaInput,
  loader: CatalogObjectLoader,
): Promise<string> {
  const resolved = resolveSchemaTarget(index, input.apiVersion, input.kind);
  if (typeof resolved === "string") {
    return resolved;
  }

  const url = schemaUrl(resolved.group, resolved.entry[0], resolved.version);
  if (!hasFieldsAtVersion(resolved.entry[2], resolved.versionIndex)) {
    return `No fields index is available for "${resolved.group}/${resolved.entry[0]}_${resolved.version}.fields.txt". Use the JSON schema directly: ${url}`;
  }

  const obj = await loader(env, catalogKey(resolved.group, resolved.entry[0], resolved.version, "fields.txt"));
  if (obj === null) {
    return `Fields index "${resolved.group}/${resolved.entry[0]}_${resolved.version}.fields.txt" was not found. Use the JSON schema directly: ${url}`;
  }

  const text = await new Response(obj.body).text();
  const header =
    `# ${formatApiVersion(resolved.group, resolved.version)} ${kindDisplay(resolved.entry)} ` +
    `from ${resolved.project.name} ${resolved.project.version} github.com/${resolved.project.repo}`;
  return formatGrepSchemaResponse(text, { query: input.query, prefix: input.prefix, limit: input.limit, header });
}

function resolveSchemaTarget(index: CatalogIndex, apiVersion: string, kind: string): ResolvedSchemaTarget | string {
  const parsed = parseApiVersionInput(apiVersion);
  const resolved = resolveKind(index, parsed.group, kind);
  if (resolved === undefined) {
    return kindNotFoundMessage(index, parsed.group, kind);
  }

  const version = resolveVersion(resolved.entry, parsed.version);
  if (version === undefined) {
    return versionNotFoundMessage(resolved.group, resolved.entry, parsed.version ?? "");
  }

  return { ...resolved, version, versionIndex: resolved.entry[1].indexOf(version) };
}

function parseApiVersionInput(apiVersion: string): ParsedApiVersionInput {
  const trimmed = apiVersion.trim();
  const slash = trimmed.indexOf("/");
  if (slash !== -1) {
    return {
      group: normalizeCoreGroup(trimmed.slice(0, slash).trim()),
      version: trimmed.slice(slash + 1).trim(),
    };
  }

  return /^v\d+((alpha|beta)\d*)?$/.test(normalize(trimmed))
    ? { group: "core", version: trimmed }
    : { group: normalizeCoreGroup(trimmed) };
}

function kindCount(project: ProjectEntry): number {
  return project.groups.reduce((total, group) => total + group.kinds.length, 0);
}

function catalogLines(index: CatalogIndex): string[] {
  return index.projects.flatMap((project) => projectCatalogLines(project, true));
}

function projectCatalogLines(project: ProjectEntry, includeProject = false): string[] {
  return project.groups.flatMap((group) =>
    group.kinds.flatMap((entry) =>
      entry[1].map((version, versionIndex) => catalogLine(project, group.g, entry, version, versionIndex, includeProject)),
    ),
  );
}

function catalogLine(
  project: ProjectEntry,
  group: string,
  entry: KindEntry,
  version: string,
  versionIndex: number,
  includeProject: boolean,
): string {
  const base = `${formatApiVersion(group, version)} ${kindDisplay(entry)}`;
  const hasFields = hasFieldsAtVersion(entry[2], versionIndex);
  if (includeProject) {
    return `${base}\t# ${project.name}${hasFields ? "" : ", no fields index"}`;
  }
  return hasFields ? base : `${base}\t# no fields index`;
}

function formatApiVersion(group: string, version: string): string {
  return normalize(group) === "core" ? version : `${group}/${version}`;
}

function catalogKey(group: string, kind: string, version: string, suffix: "json" | "fields.txt"): string {
  return `${group}/${kind}_${version}.${suffix}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeCoreGroup(group: string): string {
  return normalize(group) === "core" ? "core" : group;
}

function invalidRegexMessage(pattern: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `invalid regex ${JSON.stringify(pattern)}: ${message}`;
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

function closeKindMatches(index: CatalogIndex, group: string, kind: string): Array<{ apiVersion: string; kind: string }> {
  const normalizedGroup = normalize(group);
  const normalizedKind = normalize(kind);
  const candidates: Array<{ apiVersion: string; kind: string; score: number; sameGroup: boolean; includes: boolean }> = [];

  for (const project of index.projects) {
    for (const groupEntry of project.groups) {
      const sameGroup = normalize(groupEntry.g) === normalizedGroup;
      for (const entry of groupEntry.kinds) {
        const entryKind = normalize(entry[0]);
        candidates.push({
          apiVersion: formatApiVersion(groupEntry.g, latestVersion(entry)),
          kind: kindDisplay(entry),
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
      return a.score - b.score || a.kind.localeCompare(b.kind) || a.apiVersion.localeCompare(b.apiVersion);
    })
    .slice(0, 5)
    .map(({ apiVersion, kind }) => ({ apiVersion, kind }));
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
