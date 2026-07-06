// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { CATEGORIES } from "./config.ts";
import { dropEmptyDocs, fluxInstanceManifest } from "./extract.ts";
import { excludeByBasename, extractTarFiles, matchAsset } from "./github.ts";
import { removedFiles } from "./history.ts";
import { renderCatalogStats, renderVersionsTable, spliceVersionsTable } from "./readme.ts";
import { renderBuildSummary } from "./summary.ts";
import {
  bareVersion,
  normalizeVersion,
  openshiftRef,
  pickLatestOpenShift,
  pickLatestRelease,
} from "./resolve.ts";
import type { HistoryEntry, SourceCategory } from "./types.ts";

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

describe("extractTarFiles", () => {
  test("extracts YAML files under a directory from a git archive", async () => {
    const fixture = Bun.file(new URL("./testdata/crds-fixture.tar.gz", import.meta.url));
    const gz = new Uint8Array(await fixture.arrayBuffer());
    const files = extractTarFiles(gz, "package/crds");
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    expect(files).toEqual([
      { path: "package/crds/a.yaml", text: "kind: A\n" },
      {
        path: "package/crds/really/deeply/nested/subtree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.yaml",
        text: "kind: Deep\n",
      },
    ]);
  });

  test("applies a pax path= override to the next entry (long CRD file names)", () => {
    const long = "package/crds/apiextensions.k8s.io_v1_customresourcedefinition_verylongkind.example.com.yaml";
    const files = extractTarFiles(
      tarGz([
        { name: "top/PaxHeaders/x", typeflag: "x", text: paxRecord(`path=top/${long}`) },
        { name: "top/ignored-ustar-name", typeflag: "0", text: "kind: Long\n" },
      ]),
      "package/crds",
    );
    expect(files).toEqual([{ path: long, text: "kind: Long\n" }]);
  });

  test("applies a GNU long name to the next entry", () => {
    const files = extractTarFiles(
      tarGz([
        { name: "././@LongLink", typeflag: "L", text: "top/package/crds/gnu-long.yaml" },
        { name: "top/ignored", typeflag: "0", text: "kind: Gnu\n" },
      ]),
      "package/crds",
    );
    expect(files).toEqual([{ path: "package/crds/gnu-long.yaml", text: "kind: Gnu\n" }]);
  });

  test("ignores a pax header with no path override (e.g. symlink metadata)", () => {
    const files = extractTarFiles(
      tarGz([
        { name: "top/PaxHeaders/x", typeflag: "x", text: paxRecord("comment=abc") },
        { name: "top/package/crds/plain.yaml", typeflag: "0", text: "kind: Plain\n" },
      ]),
      "package/crds",
    );
    expect(files).toEqual([{ path: "package/crds/plain.yaml", text: "kind: Plain\n" }]);
  });

  test("throws on truncated bodies", () => {
    const header = tarHeader("top/package/crds/a.yaml", "0", 10);
    const body = new TextEncoder().encode("kind");
    expect(() => extractTarFiles(new Uint8Array(Bun.gzipSync(concatBytes([header, body]))), "package/crds")).toThrow(
      "truncated tar archive",
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
      "### Provisioning\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Provisioning A | [v1.0.0](build/history/provisioning-a.json) | 1 | 2026-07-05 |\n\n" +
        "### Runtime\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Runtime B | [v1.0.0](build/history/runtime-b.json) | 1 | 2026-07-05 |\n\n" +
        "### Platform\n\n" +
        "| Project | Version | Schemas | Updated |\n| --- | --- | --- | --- |\n" +
        "| Platform C | [v1.0.0](build/history/platform-c.json) | 1 | 2026-07-05 |",
    );
    expect(CATEGORIES.filter((category) => table.includes(`### ${category}`))).toEqual([
      "Provisioning",
      "Runtime",
      "Platform",
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
  test("renders project count, total schemas and size as shields.io badges", () => {
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
    expect(renderCatalogStats(rows, 1234)).toBe(
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
        },
        {
          repo: "controlplaneio-fluxcd/flux-operator",
          prevVersion: "v0.53.0",
          version: "v0.54.0",
          files: 8,
          added: 0,
          removed: 0,
        },
      ],
      [],
      4,
    );
    expect(out).toBe(
      `Automated update of the schema catalog.

| Source | Version | Files |
| --- | --- | --- |
| [fluxcd/flux2](https://github.com/fluxcd/flux2) | v2.9.0 -> v2.10.0 | 32 (+2 -0) |
| [controlplaneio-fluxcd/flux-operator](https://github.com/controlplaneio-fluxcd/flux-operator) | v0.53.0 -> v0.54.0 | 8 |

4 source(s) already up to date.
`,
    );
  });

  test("shows plain versions for new sources and reports orphan removals", () => {
    const out = renderBuildSummary(
      [{ repo: "cert-manager/cert-manager", prevVersion: null, version: "v1.19.0", files: 12, added: 12, removed: 0 }],
      [{ name: "flagger", files: 6 }],
      5,
    );
    expect(out).toContain("| [cert-manager/cert-manager](https://github.com/cert-manager/cert-manager) | v1.19.0 | 12 (+12 -0) |");
    expect(out).toContain("Removed `flagger` (6 files): no longer in sources.yaml.");
  });

  test("says so when nothing changed", () => {
    expect(renderBuildSummary([], [], 6)).toBe(
      "Automated update of the schema catalog.\n\nNo changes.\n\n6 source(s) already up to date.\n",
    );
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

function tarGz(entries: { name: string; typeflag: string; text: string }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const body = new TextEncoder().encode(entry.text);
    chunks.push(tarHeader(entry.name, entry.typeflag, body.length));
    chunks.push(padded(body));
  }
  chunks.push(new Uint8Array(1024));
  return new Uint8Array(Bun.gzipSync(concatBytes(chunks)));
}

/** A pax record "<len> key=value\n", where len counts the whole record. */
function paxRecord(kv: string): string {
  for (let digits = 1; ; digits++) {
    const len = digits + 1 + kv.length + 1;
    if (String(len).length === digits) return `${len} ${kv}\n`;
  }
}

function tarHeader(name: string, typeflag: string, size: number): Uint8Array {
  const header = new Uint8Array(512);
  writeAscii(header, 0, name);
  writeOctal(header, 124, 12, size);
  header[156] = typeflag.charCodeAt(0);
  writeAscii(header, 257, "ustar\0");
  return header;
}

function writeAscii(buf: Uint8Array, offset: number, value: string): void {
  buf.set(new TextEncoder().encode(value), offset);
}

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number): void {
  writeAscii(buf, offset, value.toString(8).padStart(length - 1, "0"));
  buf[offset + length - 1] = 0;
}

function padded(body: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(body.length / 512) * 512);
  out.set(body);
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
