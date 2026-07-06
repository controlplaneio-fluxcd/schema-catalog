// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { $, YAML } from "bun";
import { repoOf } from "./config.ts";
import { downloadAsset, fetchCrdDir, fetchCrdFile, findReleaseAsset } from "./github.ts";
import { FLUX_SCHEMA_BIN } from "./paths.ts";
import { bareVersion, openshiftRef } from "./resolve.ts";
import type { CrdSource, FluxInstance, Source } from "./types.ts";

/** Reports the version of the flux-schema binary in use. */
export async function fluxSchemaVersion(): Promise<string> {
  const out = await $`${FLUX_SCHEMA_BIN} --version`.text();
  return out.trim().replace(/^flux-schema version /, "");
}

/**
 * Extracts the source's JSON Schemas and field indexes at the given version
 * into the staging directory.
 */
export async function extractSource(source: Source, version: string, dir: string): Promise<void> {
  const flags = [
    "--strip-description=false",
    "--with-field-index",
    `--index-source=${source.alias} ${version} ${source.url}`,
    "--output-format={{ .Group }}/{{ .Kind }}_{{ .Version }}.json",
    `--output-dir=${dir}`,
  ];
  switch (source.extract) {
    case "k8s":
      await $`${FLUX_SCHEMA_BIN} extract k8s --version ${bareVersion(version)} ${flags}`.quiet();
      return;
    case "openshift":
      await $`${FLUX_SCHEMA_BIN} extract openshift --ref ${openshiftRef(version)} ${flags}`.quiet();
      return;
    case "crd":
      await extractCrd(source, version, flags);
  }
}

/**
 * Each stage runs as its own $ call so every command's exit code is checked:
 * a Bun shell pipeline, like bash without pipefail, only reports the last
 * command's status, letting an upstream failure pass as an empty extraction.
 */
async function extractCrd(source: CrdSource, version: string, flags: string[]): Promise<void> {
  const yaml = dropEmptyDocs(await crdYaml(source, version));
  await $`${FLUX_SCHEMA_BIN} extract crd /dev/stdin ${flags} < ${new Response(yaml)}`.quiet();
}

/**
 * Drops YAML documents that carry no mapping — empty, blank, or comment-only
 * documents anywhere in the stream. flux-schema rejects such a document
 * ("document is not a YAML mapping"), and CRD bundles routinely contain them:
 * a leading license/usage banner (rook's crds.yaml) or, in helm-rendered
 * installs, interior `# Source: …` separators where a template produced no
 * output (longhorn's longhorn.yaml). Splitting on column-0 `---` separators is
 * safe because block-scalar content is always indented.
 */
export function dropEmptyDocs(yaml: string): string {
  const docs = yaml.split(/^---[ \t]*(?:#[^\n]*)?\r?\n/m);
  const kept = docs.filter((doc) =>
    doc.split("\n").some((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("#");
    }),
  );
  return kept.join("---\n");
}

async function crdYaml(source: CrdSource, version: string): Promise<string> {
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
    return fetchCrdDir(repoOf(source), version, input.crdDir, input.exclude);
  }
  if ("crdFile" in input) {
    return fetchCrdFile(repoOf(source), version, input.crdFile);
  }
  const manifest = fluxInstanceManifest(input.fluxInstance, version);
  return await $`flux-operator build instance -f - < ${new Response(manifest)}`.quiet().text();
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
