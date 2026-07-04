import { describe, expect, test } from "bun:test";
import { fluxInstanceManifest } from "./extract.ts";
import { matchAsset } from "./github.ts";
import { removedFiles } from "./history.ts";
import { renderVersionsTable, spliceVersionsTable } from "./readme.ts";
import { bareVersion, normalizeVersion, openshiftRef, pickLatestOpenShift } from "./resolve.ts";
import type { HistoryEntry } from "./types.ts";

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

  test("renders and splices between the markers", () => {
    const table = renderVersionsTable([{ repo: "fluxcd/flux2", version: "v2.9.0" }]);
    expect(spliceVersionsTable(readme, table)).toBe(
      "# Title\n\n<!-- versions:start -->\n" +
        "| Source | Version |\n| --- | --- |\n" +
        "| [fluxcd/flux2](https://github.com/fluxcd/flux2) | v2.9.0 |\n" +
        "<!-- versions:end -->\n",
    );
  });

  test("throws when the markers are missing", () => {
    expect(() => spliceVersionsTable("# Title\n", "")).toThrow("missing");
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
