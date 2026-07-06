// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import type { CatalogIndex } from "../src/shared/types.ts";
import {
  buildSearchResults,
  formatFieldsResponse,
  getSchemaText,
  kindNotFoundMessage,
  MAX_SCHEMA_INLINE_BYTES,
  projectNotFoundMessage,
  resolveKind,
  searchFieldsText,
  sizeGuardText,
} from "../src/worker/mcp-core.ts";
import type { CatalogObjectLoader } from "../src/worker/mcp-core.ts";
import type { Env } from "../src/worker/index.ts";

const index: CatalogIndex = {
  v: 2,
  generatedAt: "2026-07-06T00:00:00.000Z",
  categories: [
    "Provisioning",
    "Runtime",
    "Orchestration & Management",
    "App Definition & Development",
    "Observability & Analysis",
    "Platform",
  ],
  projects: [
    {
      name: "fluxcd",
      alias: "Flux CD",
      cat: 2,
      repo: "fluxcd/flux2",
      version: "v2.8.0",
      builtAt: "2026-07-06",
      groups: [
        {
          g: "kustomize.toolkit.fluxcd.io",
          kinds: [["kustomization", ["v1", "v1beta2"], 1]],
        },
      ],
    },
    {
      name: "argo-workflows",
      alias: "Argo Workflows",
      cat: 3,
      repo: "argoproj/argo-workflows",
      version: "v3.8.0",
      builtAt: "2026-07-06",
      groups: [{ g: "argoproj.io", kinds: [["workflow", ["v1alpha1"], 0]] }],
    },
  ],
};

const env = {
  CATALOG: {} as R2Bucket,
  CATALOG_VERSION: "test",
  ASSETS: {
    fetch,
    connect(): Socket {
      throw new Error("not implemented");
    },
  },
} satisfies Env;

describe("MCP catalog helpers", () => {
  test("buildSearchResults includes latest schema URL and hasFields from bit 0", () => {
    const results = buildSearchResults(index, "kustomization", 10);

    expect(results).toEqual([
      {
        project: "fluxcd",
        alias: "Flux CD",
        group: "kustomize.toolkit.fluxcd.io",
        kind: "kustomization",
        versions: ["v1", "v1beta2"],
        hasFields: true,
        schemaUrl: "https://schemas.fluxoperator.dev/catalog/kustomize.toolkit.fluxcd.io/kustomization_v1.json",
      },
    ]);
  });

  test("size guard allows 262144 bytes and refuses 262145 bytes", () => {
    expect(sizeGuardText("example.io", "tiny", "v1", MAX_SCHEMA_INLINE_BYTES)).toBeUndefined();

    const refusal = sizeGuardText("example.io", "huge", "v1", MAX_SCHEMA_INLINE_BYTES + 1);
    expect(refusal).toContain("262145 bytes");
    expect(refusal).toContain("https://schemas.fluxoperator.dev/catalog/example.io/huge_v1.json");
    expect(refusal).toContain("search_fields");
  });

  test("formatFieldsResponse returns raw lines with matched footer", () => {
    const fields = [
      "spec <object> (required)\t# desired state",
      "spec.prune <boolean>\t# prune stale resources",
      "status <object>\t# observed state",
    ].join("\n");

    expect(formatFieldsResponse(fields, { query: "prune", limit: 200 })).toBe(
      "spec.prune <boolean>\t# prune stale resources\n-- matched 1 of 3 fields",
    );
  });

  test("not-found messages include helpful close matches", () => {
    expect(projectNotFoundMessage(index, "flux")).toContain("Flux CD (fluxcd)");
    expect(kindNotFoundMessage(index, "kustomize.toolkit.fluxcd.io", "kustomiztion")).toContain(
      "kustomize.toolkit.fluxcd.io/kustomization",
    );
  });

  test("resolveKind is case-insensitive for kind names", () => {
    const resolved = resolveKind(index, "kustomize.toolkit.fluxcd.io", "Kustomization");

    expect(resolved?.entry[0]).toBe("kustomization");
  });

  test("getSchemaText uses the loader and returns the size guard instead of large bodies", async () => {
    const loader: CatalogObjectLoader = async () => ({
      body: new Response("{\"too\":\"large\"}").body!,
      etag: "\"test\"",
      size: MAX_SCHEMA_INLINE_BYTES + 1,
    });

    const text = await getSchemaText(index, env, { group: "argoproj.io", kind: "workflow" }, loader);

    expect(text).toContain("exceeds the 262144 byte inline response limit");
    expect(text).toContain("https://schemas.fluxoperator.dev/catalog/argoproj.io/workflow_v1alpha1.json");
  });

  test("searchFieldsText reports schema URL when a kind has no fields file", async () => {
    const loader: CatalogObjectLoader = async () => {
      throw new Error("loader should not be called when fieldsBits is empty");
    };

    const text = await searchFieldsText(index, env, { group: "argoproj.io", kind: "workflow", limit: 200 }, loader);

    expect(text).toContain("No fields index is available");
    expect(text).toContain("https://schemas.fluxoperator.dev/catalog/argoproj.io/workflow_v1alpha1.json");
  });
});
