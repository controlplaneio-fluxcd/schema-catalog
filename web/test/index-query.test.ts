// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { compareApiVersion, findKind, searchIndex } from "../src/shared/index-query.ts";
import type { CatalogIndex } from "../src/shared/types.ts";

const index: CatalogIndex = {
  v: 3,
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
        { g: "certificates.example.io", kinds: [["other", ["v1"], 0, "Other"]] },
        { g: "infra.example.io", kinds: [["edgegateway", ["v1"], 1, "EdgeGateway"]] },
        { g: "networking.example.io", kinds: [["gateway", ["v1"], 1, "Gateway", { n: ["gw"] }]] },
      ],
    },
    {
      name: "cert-manager",
      alias: "cert-manager",
      cat: 0,
      repo: "cert-manager/cert-manager",
      version: "v1.0.0",
      builtAt: "2026-07-06",
      groups: [{ g: "cert-manager.io", kinds: [["certificate", ["v1"], 1, "Certificate", { p: "certificates", n: ["cert"] }]] }],
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
      ["gateway", 4],
      ["edgegateway", 3],
      ["other", 1],
    ]);
  });

  test("group matches beat project matches", () => {
    const hits = searchIndex(index, "cert", 2);

    expect(hits.map((hit) => [hit.kind, hit.score])).toEqual([
      ["certificate", 4],
      ["other", 2],
    ]);
  });

  test("matches plural and short-name aliases", () => {
    expect(searchIndex(index, "gw", 1).map((hit) => [hit.kind, hit.score])).toEqual([["gateway", 4]]);
    expect(searchIndex(index, "cert", 1).map((hit) => [hit.kind, hit.score])).toEqual([["certificate", 4]]);
  });
});

describe("findKind", () => {
  test("finds exact group and kind", () => {
    const hit = findKind(index, "networking.example.io", "gateway");

    expect(hit?.project.name).toBe("gateway-api");
    expect(hit?.entry).toEqual(["gateway", ["v1"], 1, "Gateway", { n: ["gw"] }]);
  });

  test("returns undefined for misses", () => {
    expect(findKind(index, "networking.example.io", "Missing")).toBeUndefined();
  });
});
