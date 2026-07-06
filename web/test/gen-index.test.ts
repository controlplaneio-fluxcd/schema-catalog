// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { generateIndex } from "../scripts/gen-index.ts";
import type { HistoryEntry, Source } from "../../build/src/types.ts";

const sources: Source[] = [
  {
    name: "alpha",
    alias: "Alpha",
    category: "Runtime",
    url: "https://github.com/example/alpha",
    extract: "crd",
    input: { crdDir: "config/crd" },
  },
  {
    name: "beta",
    alias: "Beta",
    category: "Provisioning",
    url: "https://github.com/example/beta",
    extract: "crd",
    input: { crdDir: "config/crd" },
  },
];

const baseEntry = {
  repo: "example/repo",
  version: "v1.0.0",
  builtAt: "2026-07-06T01:02:03.000Z",
  fluxSchemaVersion: "0.7.0",
};

describe("generateIndex", () => {
  test("builds sorted projects, groups, kinds, versions and fields bits", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "beta",
        files: ["catalog/beta.example.io/widget_v1.json"],
      },
      {
        ...baseEntry,
        name: "alpha",
        files: [
          "catalog/alpha.example.io/gadget_v1beta1.json",
          "catalog/alpha.example.io/gadget_v2.json",
          "catalog/alpha.example.io/gadget_v2.fields.txt",
        ],
      },
    ];

    const index = generateIndex(sources, entries);
    const alpha = index.projects[0];
    if (alpha === undefined) {
      throw new Error("expected alpha project");
    }

    expect(index.v).toBe(1);
    expect(index.categories[alpha.cat]).toBe("Runtime");
    expect(index.projects.map((project) => project.alias)).toEqual(["Alpha", "Beta"]);
    expect(alpha.repo).toBe("example/alpha");
    expect(alpha.builtAt).toBe("2026-07-06");
    expect(alpha.groups[0]?.g).toBe("alpha.example.io");
    expect(alpha.groups[0]?.kinds[0]).toEqual(["gadget", ["v2", "v1beta1"], 1]);
  });

  test("throws on bad catalog file paths", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "alpha",
        files: ["catalog/Foo/bar.json"],
      },
    ];

    expect(() => generateIndex(sources, entries)).toThrow("catalog/Foo/bar.json");
  });
});
