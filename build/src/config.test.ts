import { describe, expect, test } from "bun:test";
import { loadSources, parseSources, repoOf } from "./config.ts";

const SOURCES_YAML = new URL("../config/sources.yaml", import.meta.url).pathname;

function validSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "gateway-api",
    alias: "Gateway API",
    url: "https://github.com/kubernetes-sigs/gateway-api",
    extract: "crd",
    input: { kustomize: "config/crd" },
    ...overrides,
  };
}

describe("loadSources", () => {
  test("parses the checked-in sources.yaml", async () => {
    // loadSources enforces shape, uniqueness and URL format; adding a new
    // source to sources.yaml must not require touching this test.
    const sources = await loadSources(SOURCES_YAML);
    expect(sources.length).toBeGreaterThanOrEqual(6);
    expect(sources.some((s) => s.name === "kubernetes" && s.extract === "k8s")).toBe(true);
    const flux = sources.find((s) => s.name === "flux");
    expect(flux).toMatchObject({
      extract: "crd",
      input: { fluxInstance: { registry: "ghcr.io/fluxcd" } },
    });
  });
});

describe("parseSources", () => {
  test("accepts a version pin", () => {
    const sources = parseSources({ sources: [validSource({ version: "v1.6.0" })] });
    expect(sources[0]!.version).toBe("v1.6.0");
  });

  test("rejects a non-mapping document", () => {
    expect(() => parseSources([])).toThrow("top-level mapping");
  });

  test("rejects unknown top-level keys", () => {
    expect(() => parseSources({ sources: [validSource()], extra: 1 })).toThrow(
      "unknown top-level keys: extra",
    );
  });

  test("rejects an empty sources list", () => {
    expect(() => parseSources({ sources: [] })).toThrow("non-empty list");
  });

  test("rejects duplicate names", () => {
    expect(() => parseSources({ sources: [validSource(), validSource()] })).toThrow(
      "duplicate name 'gateway-api'",
    );
  });

  test("rejects unknown source keys", () => {
    expect(() => parseSources({ sources: [validSource({ overlay: "x" })] })).toThrow(
      "sources[0] (gateway-api): unknown keys: overlay",
    );
  });

  test("rejects invalid names", () => {
    expect(() => parseSources({ sources: [validSource({ name: "Gateway API" })] })).toThrow(
      "lowercase alphanumerics and dashes",
    );
  });

  test("rejects non-GitHub URLs", () => {
    expect(() => parseSources({ sources: [validSource({ url: "https://gitlab.com/a/b" })] })).toThrow(
      "url must be https://github.com/<owner>/<name>",
    );
  });

  test("rejects URLs with a .git suffix", () => {
    expect(() =>
      parseSources({ sources: [validSource({ url: "https://github.com/fluxcd/flux2.git" })] }),
    ).toThrow("without a .git suffix");
  });

  test("rejects unknown extract kinds", () => {
    expect(() => parseSources({ sources: [validSource({ extract: "helm" })] })).toThrow(
      "extract must be one of: k8s, openshift, crd",
    );
  });

  test("rejects input on non-crd extractors", () => {
    expect(() =>
      parseSources({ sources: [validSource({ extract: "k8s" })] }),
    ).toThrow("input is only valid for extract: crd");
  });

  test("rejects crd without input", () => {
    expect(() => parseSources({ sources: [validSource({ input: undefined })] })).toThrow(
      "extract: crd requires an input mapping",
    );
  });

  test("rejects multiple input kinds", () => {
    const input = { kustomize: "config/crd", releaseAsset: "crds.yaml" };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "exactly one of: kustomize, releaseAsset, crdDir, crdFile, fluxInstance",
    );
  });

  test("rejects unknown input kinds", () => {
    expect(() => parseSources({ sources: [validSource({ input: { helmChart: "x" } })] })).toThrow(
      "exactly one of: kustomize, releaseAsset, crdDir, crdFile, fluxInstance",
    );
  });

  test("accepts a releaseTag glob alongside an input kind", () => {
    const input = { releaseTag: "v*", releaseAsset: "app.yaml" };
    const sources = parseSources({ sources: [validSource({ input })] });
    expect(sources[0]!).toMatchObject({ input: { releaseTag: "v*", releaseAsset: "app.yaml" } });
  });

  test("rejects an empty releaseTag glob", () => {
    const input = { releaseTag: "", releaseAsset: "app.yaml" };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "input.releaseTag must be a non-empty glob",
    );
  });

  test("rejects input with only a releaseTag and no source kind", () => {
    expect(() => parseSources({ sources: [validSource({ input: { releaseTag: "v*" } })] })).toThrow(
      "exactly one of: kustomize, releaseAsset, crdDir, crdFile, fluxInstance",
    );
  });

  test("rejects an empty kustomize path", () => {
    expect(() => parseSources({ sources: [validSource({ input: { kustomize: "" } })] })).toThrow(
      "non-empty overlay path",
    );
  });

  test("accepts a crdDir input", () => {
    const sources = parseSources({ sources: [validSource({ input: { crdDir: "path/to/crds" } })] });
    expect(sources[0]!).toMatchObject({ input: { crdDir: "path/to/crds" } });
  });

  test("rejects an empty crdDir path", () => {
    expect(() => parseSources({ sources: [validSource({ input: { crdDir: "" } })] })).toThrow(
      "input.crdDir must be a non-empty repo directory path",
    );
  });

  test("accepts a crdFile input", () => {
    const sources = parseSources({
      sources: [validSource({ input: { crdFile: "deploy/crds.yaml" } })],
    });
    expect(sources[0]!).toMatchObject({ input: { crdFile: "deploy/crds.yaml" } });
  });

  test("rejects an empty crdFile path", () => {
    expect(() => parseSources({ sources: [validSource({ input: { crdFile: "" } })] })).toThrow(
      "input.crdFile must be a non-empty repo file path",
    );
  });

  test("rejects fluxInstance without components", () => {
    const input = { fluxInstance: { registry: "ghcr.io/fluxcd", components: [] } };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "components must be a non-empty list of strings",
    );
  });

  test("rejects fluxInstance with unknown keys", () => {
    const input = { fluxInstance: { registry: "r", components: ["c"], patches: [] } };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "input.fluxInstance unknown keys: patches",
    );
  });
});

describe("repoOf", () => {
  test("extracts owner/name from the URL", () => {
    expect(repoOf({ url: "https://github.com/fluxcd/flux2" })).toBe("fluxcd/flux2");
  });

  test("rejects URLs with extra path segments", () => {
    expect(() => repoOf({ url: "https://github.com/fluxcd/flux2/tree/main" })).toThrow(
      "not a GitHub repository URL",
    );
  });
});
