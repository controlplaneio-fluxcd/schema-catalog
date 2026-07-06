// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { compareApiVersion, findKind, searchIndex } from "../src/shared/index-query.ts";
import type { CatalogIndex } from "../src/shared/types.ts";

const index: CatalogIndex = {
  v: 1,
  generatedAt: "2026-07-06T00:00:00.000Z",
  categories: ["Runtime"],
  projects: [
    {
      name: "gateway-api",
      alias: "Gateway API",
      cat: 0,
      repo: "kubernetes-sigs/gateway-api",
      version: "v1.0.0",
      builtAt: "2026-07-06",
      groups: [
        { g: "certificates.example.io", kinds: [["Other", ["v1"], 0]] },
        { g: "infra.example.io", kinds: [["EdgeGateway", ["v1"], 1]] },
        { g: "networking.example.io", kinds: [["Gateway", ["v1"], 1]] },
      ],
    },
    {
      name: "cert-manager",
      alias: "cert-manager",
      cat: 0,
      repo: "cert-manager/cert-manager",
      version: "v1.0.0",
      builtAt: "2026-07-06",
      groups: [{ g: "cert-manager.io", kinds: [["Certificate", ["v1"], 1]] }],
    },
  ],
};

describe("compareApiVersion", () => {
  test("sorts by Kubernetes version priority", () => {
    const versions = ["v1alpha1", "v2beta1", "garbage", "v1", "v2alpha1", "v1beta2", "v2", "v1beta1", "v2beta2"];

    expect([...versions].sort(compareApiVersion)).toEqual([
      "v2",
      "v1",
      "v2beta2",
      "v2beta1",
      "v1beta2",
      "v1beta1",
      "v2alpha1",
      "v1alpha1",
      "garbage",
    ]);
  });

  test("sorts non-Kubernetes versions newest-first, bare before suffixed", () => {
    const versions = ["v1api20201201", "v1api20230401storage", "v1api20241101", "v1api20230401"];

    expect([...versions].sort(compareApiVersion)).toEqual([
      "v1api20241101",
      "v1api20230401",
      "v1api20230401storage",
      "v1api20201201",
    ]);
  });
});

describe("searchIndex", () => {
  test("ranks matches and respects limit", () => {
    const hits = searchIndex(index, "gate", 3);

    expect(hits.map((hit) => [hit.kind, hit.score])).toEqual([
      ["Gateway", 4],
      ["EdgeGateway", 3],
      ["Other", 1],
    ]);
  });

  test("group matches beat project matches", () => {
    const hits = searchIndex(index, "cert", 2);

    expect(hits.map((hit) => [hit.kind, hit.score])).toEqual([
      ["Certificate", 4],
      ["Other", 2],
    ]);
  });
});

describe("findKind", () => {
  test("finds exact group and kind", () => {
    const hit = findKind(index, "networking.example.io", "Gateway");

    expect(hit?.project.name).toBe("gateway-api");
    expect(hit?.entry).toEqual(["Gateway", ["v1"], 1]);
  });

  test("returns undefined for misses", () => {
    expect(findKind(index, "networking.example.io", "Missing")).toBeUndefined();
  });
});
