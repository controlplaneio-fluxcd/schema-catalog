// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { generateIndex } from "../scripts/gen-index.ts";
import type { CatalogConfig, HistoryEntry, Source } from "../../build/src/types.ts";

const sources: Source[] = [
  {
    name: "alpha",
    alias: "Alpha",
    category: "Runtime",
    cncf: "graduated",
    pin: 3,
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

const config: CatalogConfig = { sources, projects: [] };

/** Two sources grouped into one "gamma" project plus the ungrouped alpha. */
const groupedConfig: CatalogConfig = {
  sources: [
    sources[0]!,
    {
      name: "gamma-one",
      alias: "Gamma One",
      category: "Provisioning",
      cncf: "incubating",
      project: "gamma",
      url: "https://github.com/gammaproj/one",
      extract: "crd",
      input: { crdDir: "config/crd" },
    },
    {
      name: "gamma-two",
      alias: "Gamma Two",
      category: "Provisioning",
      cncf: "incubating",
      project: "gamma",
      url: "https://github.com/gammaproj/two",
      extract: "crd",
      input: { crdDir: "config/crd" },
    },
  ],
  projects: [
    {
      name: "gamma",
      alias: "Gamma",
      category: "Provisioning",
      cncf: "incubating",
      pin: 5,
      url: "https://github.com/gammaproj",
    },
  ],
};

const baseEntry = {
  repo: "example/repo",
  version: "v1.0.0",
  builtAt: "2026-07-06T01:02:03.000Z",
  fluxSchemaVersion: "0.7.0",
};

const gammaEntries: HistoryEntry[] = [
  {
    ...baseEntry,
    name: "gamma-one",
    kinds: { "gamma.example.io/Widget": {} },
    files: ["catalog/gamma.example.io/widget_v1.json", "catalog/gamma.example.io/widget_v1.fields.txt"],
  },
  {
    ...baseEntry,
    name: "gamma-two",
    version: "v2.0.0",
    builtAt: "2026-07-07T01:02:03.000Z",
    kinds: { "gamma.example.io/Gizmo": {} },
    files: ["catalog/gamma.example.io/gizmo_v1.json", "catalog/other.example.io/thing_v1.json"],
  },
];

describe("generateIndex", () => {
  test("builds sorted projects, groups, kinds, versions and fields bits", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "beta",
        kinds: {},
        files: ["catalog/beta.example.io/widget_v1.json"],
      },
      {
        ...baseEntry,
        name: "alpha",
        kinds: {
          "alpha.example.io/Gadget": { singular: "gadget", plural: "gadgets", shortNames: ["gd"] },
        },
        files: [
          "catalog/alpha.example.io/gadget_v1beta1.json",
          "catalog/alpha.example.io/gadget_v2.json",
          "catalog/alpha.example.io/gadget_v2.fields.txt",
        ],
      },
    ];

    const index = generateIndex(config, entries);
    const alpha = index.projects[0];
    const beta = index.projects[1];
    if (alpha === undefined || beta === undefined) {
      throw new Error("expected alpha and beta projects");
    }

    expect(index.v).toBe(4);
    expect(index.categories[alpha.cat]).toBe("Runtime");
    expect(index.projects.map((project) => project.alias)).toEqual(["Alpha", "Beta"]);
    expect(alpha.repo).toBe("example/alpha");
    expect(alpha.builtAt).toBe("2026-07-06");
    expect(alpha.cncf).toBe("graduated");
    expect("cncf" in beta).toBe(false);
    expect(alpha.pin).toBe(3);
    expect("pin" in beta).toBe(false);
    // Ungrouped projects keep a version and carry no member list.
    expect(alpha.version).toBe("v1.0.0");
    expect("sources" in alpha).toBe(false);
    expect(alpha.groups[0]?.g).toBe("alpha.example.io");
    // Original casing recorded in `kinds` becomes the 4th tuple element.
    expect(alpha.groups[0]?.kinds[0]).toEqual(["gadget", ["v2", "v1beta1"], 1, "Gadget", { n: ["gd"] }]);
    // A kind with no recorded casing keeps the slug and omits the display element.
    expect(beta.groups[0]?.kinds[0]).toEqual(["widget", ["v1"], 0]);
  });

  test("stores only non-derivable discovery names in kind tuples", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "alpha",
        kinds: {
          "alpha.example.io/NetworkPolicy": { singular: "networkpolicy", plural: "networkpolicies", shortNames: ["netpol"] },
          "alpha.example.io/Person": { singular: "human", plural: "people" },
        },
        files: [
          "catalog/alpha.example.io/networkpolicy_v1.json",
          "catalog/alpha.example.io/networkpolicy_v1.fields.txt",
          "catalog/alpha.example.io/person_v1.json",
          "catalog/alpha.example.io/person_v1.fields.txt",
        ],
      },
    ];

    const alpha = generateIndex(config, entries).projects[0];

    expect(alpha?.groups[0]?.kinds).toEqual([
      ["networkpolicy", ["v1"], 1, "NetworkPolicy", { n: ["netpol"] }],
      ["person", ["v1"], 1, "Person", { s: "human", p: "people" }],
    ]);
  });

  test("throws on bad catalog file paths", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "alpha",
        kinds: {},
        files: ["catalog/Foo/bar.json"],
      },
    ];

    expect(() => generateIndex(config, entries)).toThrow("catalog/Foo/bar.json");
  });

  test("merges grouped members into one project entry", () => {
    const index = generateIndex(groupedConfig, gammaEntries);
    expect(index.projects.map((project) => project.name)).toEqual(["gamma"]);
    const gamma = index.projects[0]!;

    // Identity comes from the project group, including the org-level repo.
    expect(gamma).toMatchObject({ alias: "Gamma", repo: "gammaproj", cncf: "incubating", pin: 5 });
    expect(index.categories[gamma.cat]).toBe("Provisioning");
    // No single version; builtAt is the latest member build date.
    expect("version" in gamma).toBe(false);
    expect(gamma.builtAt).toBe("2026-07-07");
    // Members are listed alias-sorted with their own version and repo.
    expect(gamma.sources).toEqual([
      { name: "gamma-one", alias: "Gamma One", repo: "gammaproj/one", version: "v1.0.0", builtAt: "2026-07-06" },
      { name: "gamma-two", alias: "Gamma Two", repo: "gammaproj/two", version: "v2.0.0", builtAt: "2026-07-07" },
    ]);
    // Kinds from both members merge under the shared API group, sorted.
    expect(gamma.groups.map((group) => group.g)).toEqual(["gamma.example.io", "other.example.io"]);
    expect(gamma.groups[0]?.kinds.map((entry) => entry[0])).toEqual(["gizmo", "widget"]);
    // Each kind is attributed to its owning member: gizmo comes from
    // gamma-two (sources[1]), widget from gamma-one (sources[0]).
    expect(gamma.groups[0]?.src).toEqual([1, 0]);
    expect(gamma.groups[1]?.src).toEqual([1]);
  });

  test("omits source attribution on single-source projects", () => {
    const entries: HistoryEntry[] = [
      {
        ...baseEntry,
        name: "alpha",
        kinds: {},
        files: ["catalog/alpha.example.io/gadget_v1.json"],
      },
    ];

    const alpha = generateIndex(config, entries).projects[0];
    expect(alpha?.groups[0] !== undefined && "src" in alpha.groups[0]).toBe(false);
  });

  test("skips members without manifests and projects with no tracked members", () => {
    // Only gamma-one has a manifest: the group still forms around it.
    const index = generateIndex(groupedConfig, [gammaEntries[0]!]);
    expect(index.projects.map((project) => project.name)).toEqual(["gamma"]);
    expect(index.projects[0]?.sources?.map((member) => member.name)).toEqual(["gamma-one"]);

    // No member manifests at all: the project entry is skipped entirely.
    expect(generateIndex(groupedConfig, []).projects).toEqual([]);
  });
});
