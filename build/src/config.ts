// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { YAML } from "bun";
import type { CrdInput, FluxInstance, Source, SourceCategory } from "./types.ts";

const EXTRACT_KINDS = ["k8s", "openshift", "crd"];
const INPUT_KINDS = ["kustomize", "releaseAsset", "crdDir", "crdFile", "fluxInstance"];
const SOURCE_KEYS = ["name", "alias", "category", "url", "version", "extract", "input"];
export const CATEGORIES = [
  "Provisioning",
  "Runtime",
  "Orchestration & Management",
  "App Definition & Development",
  "Observability & Analysis",
  "Platform",
] as const satisfies readonly SourceCategory[];
const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const REPO_URL_RE = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/;

/** Returns the owner/name part of a source's GitHub repository URL. */
export function repoOf(source: Pick<Source, "url">): string {
  const match = source.url.match(REPO_URL_RE);
  if (!match) {
    throw new Error(`not a GitHub repository URL: ${source.url}`);
  }
  return match[1]!;
}

export async function loadSources(path: string): Promise<Source[]> {
  let doc: unknown;
  try {
    doc = YAML.parse(await Bun.file(path).text());
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : err}`);
  }
  try {
    return parseSources(doc);
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

export function parseSources(doc: unknown): Source[] {
  if (!isRecord(doc)) {
    throw new Error("expected a top-level mapping with a 'sources' list");
  }
  const unknown = Object.keys(doc).filter((k) => k !== "sources");
  if (unknown.length > 0) {
    throw new Error(`unknown top-level keys: ${unknown.join(", ")}`);
  }
  if (!Array.isArray(doc.sources) || doc.sources.length === 0) {
    throw new Error("'sources' must be a non-empty list");
  }

  const names = new Set<string>();
  return doc.sources.map((entry, i) => {
    const source = parseSource(entry, `sources[${i}]`);
    if (names.has(source.name)) {
      throw new Error(`sources[${i}]: duplicate name '${source.name}'`);
    }
    names.add(source.name);
    return source;
  });
}

function parseSource(entry: unknown, ctx: string): Source {
  if (!isRecord(entry)) {
    throw new Error(`${ctx}: expected a mapping`);
  }
  if (typeof entry.name === "string") {
    ctx = `${ctx} (${entry.name})`;
  }

  const unknown = Object.keys(entry).filter((k) => !SOURCE_KEYS.includes(k));
  if (unknown.length > 0) {
    throw new Error(`${ctx}: unknown keys: ${unknown.join(", ")}`);
  }

  const name = requireString(entry, "name", ctx);
  if (!NAME_RE.test(name)) {
    throw new Error(`${ctx}: name must be lowercase alphanumerics and dashes`);
  }
  const alias = requireString(entry, "alias", ctx);
  const category = requireString(entry, "category", ctx);
  if (!isCategory(category)) {
    throw new Error(`${ctx}: category must be one of: ${CATEGORIES.join(", ")}`);
  }
  const url = requireString(entry, "url", ctx);
  if (!REPO_URL_RE.test(url) || url.endsWith(".git")) {
    throw new Error(`${ctx}: url must be https://github.com/<owner>/<name> without a .git suffix`);
  }
  if (entry.version !== undefined && (typeof entry.version !== "string" || entry.version === "")) {
    throw new Error(`${ctx}: version must be a non-empty string`);
  }
  const version = entry.version as string | undefined;

  const extract = requireString(entry, "extract", ctx);
  if (!EXTRACT_KINDS.includes(extract)) {
    throw new Error(`${ctx}: extract must be one of: ${EXTRACT_KINDS.join(", ")}`);
  }

  if (extract !== "crd") {
    if (entry.input !== undefined) {
      throw new Error(`${ctx}: input is only valid for extract: crd`);
    }
    return { name, alias, category, url, version, extract: extract as "k8s" | "openshift" };
  }
  return { name, alias, category, url, version, extract: "crd", input: parseInput(entry.input, ctx) };
}

function parseInput(input: unknown, ctx: string): CrdInput {
  if (!isRecord(input)) {
    throw new Error(`${ctx}: extract: crd requires an input mapping`);
  }
  if (
    input.releaseTag !== undefined &&
    (typeof input.releaseTag !== "string" || input.releaseTag === "")
  ) {
    throw new Error(`${ctx}: input.releaseTag must be a non-empty glob`);
  }
  const releaseTag = input.releaseTag as string | undefined;

  const kinds = Object.keys(input).filter((k) => k !== "releaseTag" && k !== "exclude");
  if (kinds.length !== 1 || !INPUT_KINDS.includes(kinds[0]!)) {
    throw new Error(`${ctx}: input must have exactly one of: ${INPUT_KINDS.join(", ")}`);
  }
  if (input.exclude !== undefined && kinds[0] !== "crdDir") {
    throw new Error(`${ctx}: input.exclude is only valid with crdDir`);
  }
  switch (kinds[0]) {
    case "kustomize":
      if (typeof input.kustomize !== "string" || input.kustomize === "") {
        throw new Error(`${ctx}: input.kustomize must be a non-empty overlay path`);
      }
      return { releaseTag, kustomize: input.kustomize };
    case "releaseAsset":
      if (typeof input.releaseAsset !== "string" || input.releaseAsset === "") {
        throw new Error(`${ctx}: input.releaseAsset must be a non-empty asset name or glob`);
      }
      return { releaseTag, releaseAsset: input.releaseAsset };
    case "crdDir":
      if (typeof input.crdDir !== "string" || input.crdDir === "") {
        throw new Error(`${ctx}: input.crdDir must be a non-empty repo directory path`);
      }
      return { releaseTag, crdDir: input.crdDir, exclude: parseExclude(input.exclude, ctx) };
    case "crdFile":
      if (typeof input.crdFile !== "string" || input.crdFile === "") {
        throw new Error(`${ctx}: input.crdFile must be a non-empty repo file path`);
      }
      return { releaseTag, crdFile: input.crdFile };
    default:
      return { releaseTag, fluxInstance: parseFluxInstance(input.fluxInstance, ctx) };
  }
}

function parseExclude(exclude: unknown, ctx: string): string[] | undefined {
  if (exclude === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(exclude) ||
    exclude.length === 0 ||
    exclude.some((e) => typeof e !== "string" || e === "")
  ) {
    throw new Error(`${ctx}: input.exclude must be a non-empty array of non-empty globs`);
  }
  return exclude as string[];
}

function parseFluxInstance(spec: unknown, ctx: string): FluxInstance {
  if (!isRecord(spec)) {
    throw new Error(`${ctx}: input.fluxInstance must be a mapping`);
  }
  const unknown = Object.keys(spec).filter((k) => k !== "registry" && k !== "components");
  if (unknown.length > 0) {
    throw new Error(`${ctx}: input.fluxInstance unknown keys: ${unknown.join(", ")}`);
  }
  const registry = requireString(spec, "registry", `${ctx}: input.fluxInstance`);
  const components = spec.components;
  if (
    !Array.isArray(components) ||
    components.length === 0 ||
    components.some((c) => typeof c !== "string" || c === "")
  ) {
    throw new Error(`${ctx}: input.fluxInstance.components must be a non-empty list of strings`);
  }
  return { registry, components };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCategory(value: string): value is SourceCategory {
  return CATEGORIES.some((category) => category === value);
}

function requireString(entry: Record<string, unknown>, key: string, ctx: string): string {
  const value = entry[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${ctx}: ${key} must be a non-empty string`);
  }
  return value;
}
