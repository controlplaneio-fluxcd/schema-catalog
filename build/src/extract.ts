// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { $, YAML } from "bun";
import { repoOf } from "./config.ts";
import { downloadAsset, fetchCrdDir, fetchCrdFile, findReleaseAsset } from "./github.ts";
import { sha256 } from "./history.ts";
import { FLUX_SCHEMA_BIN, ROOT_DIR } from "./paths.ts";
import { bareVersion, displayVersion, openshiftRef } from "./resolve.ts";
import type { CrdSource, FluxInstance, ResourceNames, Source } from "./types.ts";

// Splitting on column-0 `---` separators is safe because block-scalar content is always indented.
const YAML_DOC_SEPARATOR_RE = /^---[ \t]*(?:#[^\n]*)?\r?\n/m;

/** Reports the version of the flux-schema binary in use. */
export async function fluxSchemaVersion(): Promise<string> {
  const out = await $`${FLUX_SCHEMA_BIN} --version`.text();
  return out.trim().replace(/^flux-schema version /, "");
}

export interface ExtractionResult {
  resources: Record<string, ResourceNames>;
  /**
   * sha256 of the YAML stream piped to flux-schema; absent for the swagger
   * extractors (k8s, openshift), whose CLI fetches its own input.
   */
  inputDigest?: string;
}

/**
 * Extracts the source's JSON Schemas and field indexes at the given version
 * into the staging directory. `commit` is the SHA the version's ref resolved
 * to; the crdDir tarball fallback fetches the source archive by it so the
 * input provably matches the manifest's provenance.
 */
export async function extractSource(source: Source, version: string, dir: string, commit: string): Promise<ExtractionResult> {
  const flags = [
    "--strip-description=false",
    "--with-field-index",
    "--with-explain-type-metadata",
    // The header shows the stripped version; the git ref below stays the full tag.
    `--index-source=${source.alias} ${displayVersion(version)} ${source.url}`,
    "--output-format={{ .Group }}/{{ .Kind }}_{{ .Version }}.json",
    `--output-dir=${dir}`,
  ];
  switch (source.extract) {
    case "k8s":
      await $`${FLUX_SCHEMA_BIN} extract k8s --version ${bareVersion(version)} ${flags}`.quiet();
      return emptyExtractionResult();
    case "openshift":
      await $`${FLUX_SCHEMA_BIN} extract openshift --ref ${openshiftRef(version)} ${flags}`.quiet();
      return emptyExtractionResult();
    case "crd":
      return extractCrd(source, version, flags, commit);
  }
}

/**
 * Each stage runs as its own $ call so every command's exit code is checked:
 * a Bun shell pipeline, like bash without pipefail, only reports the last
 * command's status, letting an upstream failure pass as an empty extraction.
 */
async function extractCrd(source: CrdSource, version: string, flags: string[], commit: string): Promise<ExtractionResult> {
  const yaml = await crdYaml(source, version, commit);
  const resources = crdResourceNames(yaml);
  await $`${FLUX_SCHEMA_BIN} extract crd /dev/stdin ${flags} < ${new Response(yaml)}`.quiet();
  return { resources, inputDigest: sha256(yaml) };
}

function emptyExtractionResult(): ExtractionResult {
  return { resources: {} };
}

/** Extracts CRD discovery names from a YAML stream, keyed by `<group>/<Kind>`. */
export function crdResourceNames(yaml: string): Record<string, ResourceNames> {
  const resources: Record<string, ResourceNames> = {};
  for (const raw of yaml.split(YAML_DOC_SEPARATOR_RE)) {
    const doc = raw.trim();
    if (doc === "") {
      continue;
    }
    const parsed = YAML.parse(doc);
    const root = record(parsed);
    if (root?.kind !== "CustomResourceDefinition") {
      continue;
    }
    const spec = record(root.spec);
    const names = record(spec?.names);
    const group = stringValue(spec?.group);
    const kind = stringValue(names?.kind);
    if (group === undefined || kind === undefined) {
      continue;
    }

    const next = compactResourceNames({
      singular: stringValue(names?.singular),
      plural: stringValue(names?.plural),
      shortNames: stringArray(names?.shortNames),
    });
    const key = `${group}/${kind}`;
    const existing = resources[key];
    if (existing !== undefined && !sameResourceNames(existing, next)) {
      throw new Error(`conflicting CRD resource names for ${key}`);
    }
    resources[key] = next;
  }

  return Object.fromEntries(Object.entries(resources).sort(([a], [b]) => a.localeCompare(b)));
}

function compactResourceNames(names: ResourceNames): ResourceNames {
  return {
    ...(names.singular === undefined ? {} : { singular: names.singular }),
    ...(names.plural === undefined ? {} : { plural: names.plural }),
    ...(names.shortNames === undefined || names.shortNames.length === 0 ? {} : { shortNames: names.shortNames }),
  };
}

function sameResourceNames(a: ResourceNames, b: ResourceNames): boolean {
  return (
    a.singular === b.singular &&
    a.plural === b.plural &&
    (a.shortNames ?? []).join("\0") === (b.shortNames ?? []).join("\0")
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item === "" || seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

async function crdYaml(source: CrdSource, version: string, commit: string): Promise<string> {
  const input = source.input;
  if ("kustomize" in input) {
    const overlay = `https://github.com/${repoOf(source)}/${input.kustomize}?ref=${version}`;
    return await $`kubectl kustomize ${overlay}`.quiet().text();
  }
  if ("releaseAsset" in input) {
    const asset = await findReleaseAsset(repoOf(source), version, input.releaseAsset);
    return downloadAsset(asset);
  }
  if ("crdDir" in input) {
    return fetchCrdDir(repoOf(source), version, commit, input.crdDir, input.exclude);
  }
  if ("crdFile" in input) {
    return fetchCrdFile(repoOf(source), version, input.crdFile);
  }
  const manifest = fluxInstanceManifest(input.fluxInstance, version);
  // The distribution artifact is public; point DOCKER_CONFIG at a dir with no
  // config.json so the pull stays anonymous instead of invoking the user's
  // docker credential helpers (which can prompt or time out).
  return await $`flux-operator build instance -f - < ${new Response(manifest)}`
    .env({ ...process.env, DOCKER_CONFIG: ROOT_DIR })
    .quiet()
    .text();
}

/** The FluxInstance manifest piped through `flux-operator build instance`. */
export function fluxInstanceManifest(spec: FluxInstance, version: string): string {
  return YAML.stringify({
    apiVersion: "fluxcd.controlplane.io/v1",
    kind: "FluxInstance",
    metadata: { name: "flux", namespace: "flux-system" },
    spec: {
      distribution: { version, registry: spec.registry },
      components: spec.components,
    },
  });
}
