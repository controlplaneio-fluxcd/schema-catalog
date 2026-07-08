// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { parsePositiveIntegerFlag } from "./cli.ts";
import { CATEGORIES } from "./config.ts";
import { crdResourceNames, dropEmptyDocs, fluxInstanceManifest } from "./extract.ts";
import { excludeByBasename, matchAsset, yamlFilesInTree } from "./github.ts";
import { historyKinds, kindCasing, parseKindName, pruneKindsWithoutFields, removedFiles } from "./history.ts";
import { runBoundedPool } from "./pool.ts";
import { renderCatalogStats, renderVersionsTable, spliceVersionsTable } from "./readme.ts";
import { renderBuildSummary } from "./summary.ts";
import {
  bareVersion,
  displayVersion,
  normalizeVersion,
  openshiftRef,
  pickLatestOpenShift,
  pickLatestRelease,
  sourceRef,
} from "./resolve.ts";
import type { HistoryEntry, Source, SourceCategory } from "./types.ts";

describe("parsePositiveIntegerFlag", () => {
  test("uses the default when the flag is absent", () => {
    expect(parsePositiveIntegerFlag("--concurrent", undefined, 2)).toBe(2);
  });

  test("accepts positive integers", () => {
    expect(parsePositiveIntegerFlag("--concurrent", "4", 2)).toBe(4);
  });

  test("rejects invalid values", () => {
    for (const value of ["", "0", "-1", "1.5", "two"]) {
      expect(() => parsePositiveIntegerFlag("--concurrent", value, 2)).toThrow(
        "--concurrent must be a positive integer",
      );
    }
  });
});

describe("runBoundedPool", () => {
  test("limits concurrent tasks and preserves input order in results", async () => {
    let active = 0;
    let peak = 0;
    const results = await runBoundedPool([1, 2, 3, 4], 2, async (item) => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(1);
      active--;
      return item * 10;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results.map((result) => ("value" in result ? result.value : null))).toEqual([10, 20, 30, 40]);
  });

  test("continues scheduling after failures", async () => {
    const results = await runBoundedPool([1, 2, 3], 2, async (item) => {
      if (item === 1) {
        throw new Error("boom");
      }
      return item;
    });

    expect(results.map((result) => result.item)).toEqual([1, 2, 3]);
    expect(results.some((result) => "error" in result && result.item === 1)).toBe(true);
  });
});

describe("matchAsset", () => {
  test("matches exact names", () => {
    expect(matchAsset("cert-manager.crds.yaml", "cert-manager.crds.yaml")).toBe(true);
    expect(matchAsset("cert-manager.crds.yaml", "cert-manager.yaml")).toBe(false);
  });

  test("matches wildcards", () => {
    expect(matchAsset("install-*.yaml", "install-v1.13.0.yaml")).toBe(true);
    expect(matchAsset("*.crds.yaml", "kyverno.crds.yaml")).toBe(true);
    expect(matchAsset("*.crds.yaml", "kyverno.yaml")).toBe(false);
  });

  test("treats regex metacharacters literally", () => {
    expect(matchAsset("a.b.yaml", "aXb.yaml")).toBe(false);
  });
});

describe("yamlFilesInTree", () => {
  test("keeps only .yaml blobs under the directory", () => {
    const entries = [
      { path: "package/crds/s3.aws.upbound.io_buckets.yaml", type: "blob" },
      { path: "package/crds/sub/nested.yaml", type: "blob" },
      { path: "package/crds", type: "tree" },
      { path: "package/crds/README.md", type: "blob" },
      { path: "package/crossplane.yaml", type: "blob" },
      { path: "package/crds-other/decoy.yaml", type: "blob" },
    ];
    expect(yamlFilesInTree(entries, "package/crds")).toEqual([
      "package/crds/s3.aws.upbound.io_buckets.yaml",
      "package/crds/sub/nested.yaml",
    ]);
  });
});

describe("excludeByBasename", () => {
  const files = [
    { path: "libcalico-go/config/crd/crd.projectcalico.org_ippools.yaml" },
    { path: "libcalico-go/config/crd/crd.projectcalico.org_bgppeers.yaml" },
    { path: "libcalico-go/config/crd/policy.networking.k8s.io_clusternetworkpolicies.yaml" },
  ];

  test("drops files whose basename matches a glob", () => {
    const kept = excludeByBasename(files, ["policy.networking.k8s.io_*"], "ctx");
    expect(kept.map((f) => f.path)).toEqual([
      "libcalico-go/config/crd/crd.projectcalico.org_ippools.yaml",
      "libcalico-go/config/crd/crd.projectcalico.org_bgppeers.yaml",
    ]);
  });

  test("returns input unchanged with no globs", () => {
    expect(excludeByBasename(files, [], "ctx")).toBe(files);
  });

  test("throws when a glob matches nothing (stale exclude)", () => {
    expect(() => excludeByBasename(files, ["gateway.networking.k8s.io_*"], "ctx")).toThrow(
      /exclude 'gateway.networking.k8s.io_\*' matched no file/,
    );
  });
});

describe("version helpers", () => {
  test("normalizeVersion adds the v prefix to numeric versions only", () => {
    expect(normalizeVersion("1.36.2")).toBe("v1.36.2");
    expect(normalizeVersion("v2.9.0")).toBe("v2.9.0");
    expect(normalizeVersion("release-4.20")).toBe("release-4.20");
  });

  test("openshiftRef and bareVersion strip the v prefix", () => {
    expect(openshiftRef("v4.20")).toBe("release-4.20");
    expect(bareVersion("v1.36.2")).toBe("1.36.2");
  });

  test("openshiftRef passes branch-name pins through unchanged", () => {
    expect(openshiftRef("release-4.20")).toBe("release-4.20");
  });

  test("sourceRef maps openshift versions to the release branch, others to the tag", () => {
    const base = { name: "s", alias: "S", category: "Platform" as SourceCategory, url: "https://github.com/o/r" };
    const openshift: Source = { ...base, extract: "openshift" };
    const k8s: Source = { ...base, extract: "k8s" };
    const crd: Source = { ...base, extract: "crd", input: { kustomize: "config/crd" } };
    expect(sourceRef(openshift, "v4.20")).toBe("release-4.20");
    expect(sourceRef(k8s, "v1.36.2")).toBe("v1.36.2");
    expect(sourceRef(crd, "operator/v0.10.2")).toBe("operator/v0.10.2");
  });

  test("displayVersion strips the project-name prefix, keeping an upstream v", () => {
    expect(displayVersion("operator/v0.10.2")).toBe("v0.10.2");
    expect(displayVersion("knative-v1.22.2")).toBe("v1.22.2");
    expect(displayVersion("opensearch-operator-3.0.2")).toBe("3.0.2");
    expect(displayVersion("gha-runner-scale-set-0.14.2")).toBe("0.14.2");
    expect(displayVersion("mariadb-operator-crds-26.6.0")).toBe("26.6.0");
    expect(displayVersion("vertical-pod-autoscaler-1.7.0")).toBe("1.7.0");
  });

  test("displayVersion leaves unprefixed versions untouched", () => {
    expect(displayVersion("v5.24.0")).toBe("v5.24.0");
    expect(displayVersion("0.51.0")).toBe("0.51.0");
    expect(displayVersion("v4.20")).toBe("v4.20");
    expect(displayVersion("v3.0.0-alpha.2")).toBe("v3.0.0-alpha.2");
  });
});

describe("pickLatestOpenShift", () => {
  test("picks the highest non-EOL release regardless of API order", () => {
    const doc = {
      result: {
        releases: [
          { name: "4.18", isEol: false },
          { name: "4.9", isEol: false },
          { name: "4.20", isEol: true },
          { name: "4.19", isEol: false },
        ],
      },
    };
    expect(pickLatestOpenShift(doc)).toBe("4.19");
  });

  test("strips patch components from release names", () => {
    const doc = { result: { releases: [{ name: "4.20.3", isEol: false }] } };
    expect(pickLatestOpenShift(doc)).toBe("4.20");
  });

  test("throws when no non-EOL release exists", () => {
    expect(() => pickLatestOpenShift({ result: { releases: [] } })).toThrow(
      "could not resolve the latest OpenShift release",
    );
  });
});

describe("pickLatestRelease", () => {
  const rel = (tag: string, extra: Partial<{ draft: boolean; prerelease: boolean }> = {}) => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    ...extra,
  });

  test("ignores tags that do not match the glob", () => {
    const releases = [rel("helm-chart-2.7.0"), rel("v2.7.0"), rel("helm-chart-2.6.0")];
    expect(pickLatestRelease(releases, "v*")).toBe("v2.7.0");
  });

  test("picks the highest semver, not the most recent, regardless of order", () => {
    const releases = [rel("v2.7.0"), rel("v1.3.3"), rel("v2.6.0")];
    expect(pickLatestRelease(releases, "v*")).toBe("v2.7.0");
  });

  test("skips drafts and prereleases", () => {
    const releases = [
      rel("v2.8.0", { prerelease: true }),
      rel("v2.9.0", { draft: true }),
      rel("v2.7.0"),
    ];
    expect(pickLatestRelease(releases, "v*")).toBe("v2.7.0");
  });

  test("throws when no release matches the glob", () => {
    expect(() => pickLatestRelease([rel("helm-chart-2.7.0")], "v*")).toThrow(
      "no release tag matches 'v*'",
    );
  });

  test("resolves a monorepo component prefix, ignoring the chart tags", () => {
    const releases = [
      rel("cluster-autoscaler-1.33.0"),
      rel("vertical-pod-autoscaler-chart-0.10.0"),
      rel("vertical-pod-autoscaler-1.7.0"),
      rel("vertical-pod-autoscaler-1.6.0"),
    ];
    expect(pickLatestRelease(releases, "vertical-pod-autoscaler-*")).toBe(
      "vertical-pod-autoscaler-1.7.0",
    );
  });

  test("orders prefixed tags by embedded semver, not lexically", () => {
    const releases = [
      rel("vertical-pod-autoscaler-1.10.0"),
      rel("vertical-pod-autoscaler-1.9.0"),
    ];
    expect(pickLatestRelease(releases, "vertical-pod-autoscaler-*")).toBe(
      "vertical-pod-autoscaler-1.10.0",
    );
  });
});

describe("removedFiles", () => {
  const prev: HistoryEntry = {
    name: "x",
    repo: "a/b",
    version: "v1",
    builtAt: "",
    fluxSchemaVersion: "",
    kinds: { "g/A": {}, "g/B": {} },
    files: ["catalog/g/A_v1.json", "catalog/g/A_v1.fields.txt", "catalog/g/B_v1.json"],
  };

  test("returns files the new build no longer produces", () => {
    expect(
      removedFiles(prev, ["catalog/g/A_v1.json", "catalog/g/A_v1.fields.txt"], new Set()),
    ).toEqual(["catalog/g/B_v1.json"]);
  });

  test("returns nothing on the first build", () => {
    expect(removedFiles(null, ["catalog/g/A_v1.json"], new Set())).toEqual([]);
  });

  test("never returns files owned by another source", () => {
    const foreign = new Set(["catalog/g/B_v1.json"]);
    expect(removedFiles(prev, ["catalog/g/A_v1.json", "catalog/g/A_v1.fields.txt"], foreign)).toEqual(
      [],
    );
  });

  test("GCs everything except foreign files when a source is removed", () => {
    expect(removedFiles(prev, [], new Set(["catalog/g/B_v1.json"]))).toEqual([
      "catalog/g/A_v1.json",
      "catalog/g/A_v1.fields.txt",
    ]);
  });
});

describe("pruneKindsWithoutFields", () => {
  test("drops a *List kind that has only a schema and no field index", () => {
    const files = [
      "accessanalyzer.aws.upbound.io/archiverule_v1beta1.json",
      "accessanalyzer.aws.upbound.io/archiverule_v1beta1.fields.txt",
      "accessanalyzer.aws.upbound.io/archiverulelist_v1beta1.json",
    ];
    expect(pruneKindsWithoutFields(files)).toEqual([
      "accessanalyzer.aws.upbound.io/archiverule_v1beta1.json",
      "accessanalyzer.aws.upbound.io/archiverule_v1beta1.fields.txt",
    ]);
  });

  test("keeps a real kind whose name ends in 'list' because it has a field index", () => {
    const files = [
      "ec2.aws.upbound.io/managedprefixlist_v1beta1.json",
      "ec2.aws.upbound.io/managedprefixlist_v1beta1.fields.txt",
    ];
    expect(pruneKindsWithoutFields(files)).toEqual(files);
  });

  test("is kind-scoped: a schema-only version survives when a sibling version has fields", () => {
    const files = [
      "g.io/gadget_v1beta1.json",
      "g.io/gadget_v2.json",
      "g.io/gadget_v2.fields.txt",
    ];
    expect(pruneKindsWithoutFields(files)).toEqual(files);
  });

  test("works on catalog/-prefixed history paths too", () => {
    const files = [
      "catalog/g.io/foo_v1.json",
      "catalog/g.io/foo_v1.fields.txt",
      "catalog/g.io/foolist_v1.json",
    ];
    expect(pruneKindsWithoutFields(files)).toEqual([
      "catalog/g.io/foo_v1.json",
      "catalog/g.io/foo_v1.fields.txt",
    ]);
  });
});

describe("parseKindName", () => {
  test("reads the original casing from the kind enum row", () => {
    const text = "apiVersion <string>\nkind <string> enum=ArchiveRule (cluster-scoped)\nmetadata.name <string> (required)\n";
    expect(parseKindName(text)).toBe("ArchiveRule");
  });

  test("handles an enum with no scope suffix at end of line", () => {
    expect(parseKindName("kind <string> enum=Canary")).toBe("Canary");
  });

  test("ignores nested fields that merely end in 'kind'", () => {
    const text = "spec.resourceRef.kind <string>\nkind <string> enum=HelmRelease (namespaced)\n";
    expect(parseKindName(text)).toBe("HelmRelease");
  });

  test("returns null when there is no top-level kind enum", () => {
    expect(parseKindName("metadata.name <string> (required)\n")).toBeNull();
  });
});

describe("kindCasing", () => {
  test("builds sorted unique <group>/<Kind> ids, reading each kind once", async () => {
    const reads: string[] = [];
    const fields: Record<string, string> = {
      "g.io/canary_v1beta1.fields.txt": "kind <string> enum=Canary (namespaced)\n",
      "g.io/canary_v1.fields.txt": "kind <string> enum=Canary (namespaced)\n",
      "a.io/alertprovider_v1beta1.fields.txt": "kind <string> enum=AlertProvider (namespaced)\n",
    };
    const files = [
      "g.io/canary_v1beta1.json",
      "g.io/canary_v1beta1.fields.txt",
      "g.io/canary_v1.json",
      "g.io/canary_v1.fields.txt",
      "a.io/alertprovider_v1beta1.json",
      "a.io/alertprovider_v1beta1.fields.txt",
    ];
    const kinds = await kindCasing(files, (file) => {
      reads.push(file);
      return Promise.resolve(fields[file]!);
    });
    expect(kinds).toEqual(["a.io/AlertProvider", "g.io/Canary"]);
    // Canary appears at two versions but its fields file is read once.
    expect(reads).toEqual(["g.io/canary_v1beta1.fields.txt", "a.io/alertprovider_v1beta1.fields.txt"]);
  });

  test("throws when a field index is missing its kind enum row", () => {
    const files = ["g.io/broken_v1.fields.txt"];
    expect(kindCasing(files, () => Promise.resolve("metadata.name <string>\n"))).rejects.toThrow(
      "no kind enum in g.io/broken_v1.fields.txt",
    );
  });
});

describe("historyKinds", () => {
  test("merges sorted indexed kinds with matching resources", () => {
    expect(
      historyKinds(
        {
          "example.io/Widget": { plural: "widgets", shortNames: ["wdg"] },
          "example.io/WidgetList": { plural: "widgetlists" },
        },
        ["example.io/Widget", "example.io/Gadget"],
      ),
    ).toEqual({
      "example.io/Gadget": {},
      "example.io/Widget": { plural: "widgets", shortNames: ["wdg"] },
    });
  });

  test("returns empty objects when no resources match", () => {
    expect(historyKinds({ "example.io/Widget": { plural: "widgets" } }, ["example.io/Gadget"])).toEqual({
      "example.io/Gadget": {},
    });
  });

  test("returns an empty map when there are no indexed kinds", () => {
    expect(historyKinds({ "example.io/Widget": { plural: "widgets" } }, [])).toEqual({});
  });
});

describe("versions table", () => {
  const readme = "# Title\n\n<!-- versions:start -->\nstale\n<!-- versions:end -->\n";
  const versionRow = (
    alias: string,
    category: SourceCategory,
    overrides: Partial<{
      name: string;
      version: string;
      builtAt: string;
      schemas: number;
    }> = {},
  ) => ({
    alias,
    category,
    name: overrides.name ?? alias.toLowerCase().replaceAll(" ", "-"),
    version: overrides.version ?? "v1.0.0",
    builtAt: overrides.builtAt ?? "2026-07-05T03:15:00.000Z",
    schemas: overrides.schemas ?? 1,
  });

  test("renders and splices between the markers", () => {
    const table = renderVersionsTable([
      versionRow("Flux", "Orchestration & Management", { version: "v2.9.0", schemas: 34 }),
    ]);
    expect(spliceVersionsTable(readme, table)).toBe(
      "# Title\n\n<!-- versions:start -->\n" +
        "### Orchestration & Management\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Flux | [v2.9.0](build/history/flux.json) | 34 | 2026-07-05 |\n" +
        "<!-- versions:end -->\n",
    );
  });

  test("throws when the markers are missing", () => {
    expect(() => spliceVersionsTable("# Title\n", "")).toThrow("missing");
  });

  test("renders multiple categories in configured order and skips empty categories", () => {
    const table = renderVersionsTable([
      versionRow("Runtime B", "Runtime", { name: "runtime-b" }),
      versionRow("Provisioning A", "Provisioning", { name: "provisioning-a" }),
      versionRow("Platform C", "Platform", { name: "platform-c" }),
    ]);

    expect(table).toBe(
      "### Platform\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Platform C | [v1.0.0](build/history/platform-c.json) | 1 | 2026-07-05 |\n\n" +
        "### Provisioning\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Provisioning A | [v1.0.0](build/history/provisioning-a.json) | 1 | 2026-07-05 |\n\n" +
        "### Runtime\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Runtime B | [v1.0.0](build/history/runtime-b.json) | 1 | 2026-07-05 |",
    );
    expect(CATEGORIES.filter((category) => table.includes(`### ${category}`))).toEqual([
      "Platform",
      "Provisioning",
      "Runtime",
    ]);
  });

  test("sorts rows alphabetically within each category case-insensitively", () => {
    const table = renderVersionsTable([
      versionRow("beta", "Runtime"),
      versionRow("Alpha", "Runtime"),
      versionRow("gamma", "Runtime"),
    ]);

    expect(table).toBe(
      "### Runtime\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Alpha | [v1.0.0](build/history/alpha.json) | 1 | 2026-07-05 |\n" +
        "| beta | [v1.0.0](build/history/beta.json) | 1 | 2026-07-05 |\n" +
        "| gamma | [v1.0.0](build/history/gamma.json) | 1 | 2026-07-05 |",
    );
  });
});

describe("renderCatalogStats", () => {
  test("renders the presented-project count, total schemas and size as shields.io badges", () => {
    const rows = [
      {
        alias: "Flux",
        category: "Orchestration & Management" as const,
        name: "flux",
        version: "v2.9.0",
        builtAt: "",
        schemas: 15,
      },
      {
        alias: "AWS",
        category: "Provisioning" as const,
        name: "provider-upjet-aws",
        version: "v2.6.0",
        builtAt: "",
        schemas: 2364,
      },
    ];
    // The badge count is passed in, not derived from rows: grouped sources
    // collapse into one presented project.
    expect(renderCatalogStats(rows, 1234, 2)).toBe(
      "![Projects](https://img.shields.io/badge/Projects-2-2088FF?style=flat-square) " +
        "![Schemas](https://img.shields.io/badge/Schemas-2%2C379-3FB950?style=flat-square) " +
        "![Catalog size](https://img.shields.io/badge/Catalog%20size-1%2C234%20MB-8957E5?style=flat-square)",
    );
  });
});

describe("renderBuildSummary", () => {
  test("lists only changed sources with version transitions and file deltas", () => {
    const out = renderBuildSummary(
      [
        {
          repo: "fluxcd/flux2",
          prevVersion: "v2.9.0",
          version: "v2.10.0",
          files: 32,
          added: 2,
          removed: 0,
          changed: 30,
        },
        {
          repo: "controlplaneio-fluxcd/flux-operator",
          prevVersion: "v0.53.0",
          version: "v0.54.0",
          files: 8,
          added: 0,
          removed: 0,
          changed: 0,
        },
      ],
      [],
      4,
    );
    expect(out).toBe(
      `Automated update of the schema catalog.

| Source | Version | Files |
| --- | --- | --- |
| [fluxcd/flux2](https://github.com/fluxcd/flux2) | v2.9.0 -> v2.10.0 | 32 (+2 -0 ~30) |
| [controlplaneio-fluxcd/flux-operator](https://github.com/controlplaneio-fluxcd/flux-operator) | v0.53.0 -> v0.54.0 | 8 |

4 source(s) already up to date.
`,
    );
  });

  test("shows plain versions for new sources and reports orphan removals", () => {
    const out = renderBuildSummary(
      [
        {
          repo: "cert-manager/cert-manager",
          prevVersion: null,
          version: "v1.19.0",
          files: 12,
          added: 12,
          removed: 0,
          changed: 0,
        },
      ],
      [{ name: "flagger", files: 6 }],
      5,
    );
    expect(out).toContain("| [cert-manager/cert-manager](https://github.com/cert-manager/cert-manager) | v1.19.0 | 12 (+12 -0 ~0) |");
    expect(out).toContain("Removed `flagger` (6 files): no longer in sources.yaml.");
  });

  test("says so when nothing changed", () => {
    expect(renderBuildSummary([], [], 6)).toBe(
      "Automated update of the schema catalog.\n\nNo changes.\n\n6 source(s) already up to date.\n",
    );
  });

  test("renders a warning block listing source failures when passed", () => {
    const out = renderBuildSummary(
      [{ repo: "fluxcd/flux2", prevVersion: "v2.9.0", version: "v2.10.0", files: 32, added: 2, removed: 0, changed: 30 }],
      [],
      4,
      [{ name: "openshift", message: "GET https://endoflife.date/...\nsocket closed" }],
    );
    expect(out).toContain("> [!WARNING]");
    expect(out).toContain("> 1 source(s) failed to build:");
    expect(out).toContain("> - `openshift`: GET https://endoflife.date/...; socket closed");
  });

  test("omits the failure block when no failures are passed", () => {
    expect(renderBuildSummary([], [], 6)).not.toContain("[!WARNING]");
  });
});

describe("fluxInstanceManifest", () => {
  test("sets the resolved version and declared components", () => {
    const yaml = fluxInstanceManifest(
      { registry: "ghcr.io/fluxcd", components: ["source-controller"] },
      "v2.9.0",
    );
    const doc = Bun.YAML.parse(yaml) as Record<string, any>;
    expect(doc.kind).toBe("FluxInstance");
    expect(doc.spec.distribution).toEqual({ version: "v2.9.0", registry: "ghcr.io/fluxcd" });
    expect(doc.spec.components).toEqual(["source-controller"]);
  });
});

describe("crdResourceNames", () => {
  test("extracts plural, singular and short names from CRD streams", () => {
    const yaml = `
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
spec:
  group: source.extensions.fluxcd.io
  names:
    kind: ArtifactGenerator
    plural: artifactgenerators
    singular: artifactgenerator
    shortNames:
      - ag
---
apiVersion: v1
kind: ConfigMap
`;

    expect(crdResourceNames(yaml)).toEqual({
      "source.extensions.fluxcd.io/ArtifactGenerator": {
        singular: "artifactgenerator",
        plural: "artifactgenerators",
        shortNames: ["ag"],
      },
    });
  });

  test("deduplicates short names and accepts repeated identical CRDs", () => {
    const crd = `
kind: CustomResourceDefinition
spec:
  group: example.io
  names:
    kind: Widget
    plural: widgets
    shortNames: [wdg, wdg]
`;

    expect(crdResourceNames(`${crd}---\n${crd}`)).toEqual({
      "example.io/Widget": { plural: "widgets", shortNames: ["wdg"] },
    });
  });

  test("fails on conflicting names for the same group and kind", () => {
    const yaml = `
kind: CustomResourceDefinition
spec:
  group: example.io
  names:
    kind: Widget
    plural: widgets
---
kind: CustomResourceDefinition
spec:
  group: example.io
  names:
    kind: Widget
    plural: widgets2
`;

    expect(() => crdResourceNames(yaml)).toThrow("conflicting CRD resource names for example.io/Widget");
  });
});

describe("dropEmptyDocs", () => {
  test("strips a leading comment banner terminated by ---", () => {
    const yaml = "# banner line 1\n# banner line 2\n---\napiVersion: v1\nkind: Foo\n";
    expect(dropEmptyDocs(yaml)).toBe("apiVersion: v1\nkind: Foo\n");
  });

  test("strips a lone leading document marker", () => {
    expect(dropEmptyDocs("---\nkind: Foo\n")).toBe("kind: Foo\n");
  });

  test("drops an interior comment-only document", () => {
    const yaml = "kind: Foo\n---\n# Source: chart/empty.yaml\n---\nkind: Bar\n";
    expect(dropEmptyDocs(yaml)).toBe("kind: Foo\n---\nkind: Bar\n");
  });

  test("leaves a stream that opens with content untouched", () => {
    const yaml = "apiVersion: v1\nkind: Foo\n---\nkind: Bar\n";
    expect(dropEmptyDocs(yaml)).toBe(yaml);
  });

  test("does not strip past the first document", () => {
    const yaml = "kind: Foo\n---\nkind: Bar\n";
    expect(dropEmptyDocs(yaml)).toBe(yaml);
  });
});
