// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { CATEGORIES, loadConfig, parseConfig, repoOf, repoOfProject } from "./config.ts";
import type { Source } from "./types.ts";

const SOURCES_YAML = new URL("../config/sources.yaml", import.meta.url).pathname;

function validSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "gateway-api",
    alias: "Gateway API",
    category: "Orchestration & Management",
    url: "https://github.com/kubernetes-sigs/gateway-api",
    extract: "crd",
    input: { kustomize: "config/crd" },
    ...overrides,
  };
}

function validProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "aws-ack",
    alias: "AWS Controllers for Kubernetes",
    category: "Provisioning",
    url: "https://github.com/aws-controllers-k8s",
    ...overrides,
  };
}

/** A project with two member sources, the minimum valid group. */
function groupedDoc(
  project: Record<string, unknown> = {},
  members: Record<string, unknown>[] = [{}, {}],
): Record<string, unknown> {
  return {
    projects: [validProject(project)],
    sources: members.map((member, i) =>
      validSource({ name: `ack-${i}`, category: undefined, project: "aws-ack", ...member }),
    ),
  };
}

/** Legacy shim: most cases only assert on the parsed source list. */
function parseSources(doc: unknown): Source[] {
  return parseConfig(doc).sources;
}

describe("loadConfig", () => {
  test("parses the checked-in sources.yaml", async () => {
    // loadConfig enforces shape, uniqueness, URL format and project-group
    // rules; adding a new source or group to sources.yaml must not require
    // touching this test.
    const { sources, projects } = await loadConfig(SOURCES_YAML);
    expect(sources.length).toBeGreaterThanOrEqual(6);
    expect(sources.some((s) => s.name === "kubernetes" && s.extract === "k8s")).toBe(true);
    const flux = sources.find((s) => s.name === "flux");
    expect(flux).toMatchObject({
      extract: "crd",
      input: { fluxInstance: { registry: "ghcr.io/fluxcd" } },
    });
    expect(projects.some((p) => p.name === "aws-ack")).toBe(true);
    const ackS3 = sources.find((s) => s.name === "ack-s3");
    expect(ackS3).toMatchObject({
      project: "aws-ack",
      category: "Provisioning",
    });
    expect(ackS3!.pin).toBeUndefined();
  });
});

describe("parseConfig", () => {
  test("accepts a version pin", () => {
    const sources = parseSources({ sources: [validSource({ version: "v1.6.0" })] });
    expect(sources[0]!.version).toBe("v1.6.0");
  });

  test("accepts CNCF maturity levels", () => {
    const sources = parseSources({
      sources: ["graduated", "incubating", "sandbox"].map((cncf, i) =>
        validSource({ name: `source-${i}`, cncf }),
      ),
    });
    expect(sources.map((source) => source.cncf)).toEqual(["graduated", "incubating", "sandbox"]);
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

  test("rejects a missing category", () => {
    expect(() => parseSources({ sources: [validSource({ category: undefined })] })).toThrow(
      "category must be a non-empty string",
    );
  });

  test("rejects an invalid category", () => {
    expect(() => parseSources({ sources: [validSource({ category: "Networking" })] })).toThrow(
      `category must be one of: ${CATEGORIES.join(", ")}`,
    );
  });

  test("rejects unsupported CNCF maturity values", () => {
    expect(() => parseSources({ sources: [validSource({ cncf: "archived" })] })).toThrow(
      "cncf must be one of: graduated, incubating, sandbox",
    );
  });

  test("rejects non-string CNCF maturity values", () => {
    expect(() => parseSources({ sources: [validSource({ cncf: 1 })] })).toThrow(
      "cncf must be one of: graduated, incubating, sandbox",
    );
  });

  test("accepts a category preview pin", () => {
    const sources = parseSources({ sources: [validSource({ pin: 2 })] });
    expect(sources[0]!.pin).toBe(2);
  });

  test("rejects non-positive-integer pins", () => {
    for (const pin of [0, -1, 1.5, "1"]) {
      expect(() => parseSources({ sources: [validSource({ pin })] })).toThrow(
        "pin must be a positive integer",
      );
    }
  });

  test("rejects duplicate pins within a category", () => {
    expect(() =>
      parseSources({
        sources: [validSource({ pin: 1 }), validSource({ name: "kueue", pin: 1 })],
      }),
    ).toThrow("duplicate pin 1 in category 'Orchestration & Management'");
  });

  test("allows the same pin across categories", () => {
    const sources = parseSources({
      sources: [validSource({ pin: 1 }), validSource({ name: "kueue", category: "Runtime", pin: 1 })],
    });
    expect(sources.map((source) => source.pin)).toEqual([1, 1]);
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

  test("accepts crdDir with an exclude list", () => {
    const input = { crdDir: "config/crd", exclude: ["policy.networking.k8s.io_*"] };
    const sources = parseSources({ sources: [validSource({ input })] });
    expect(sources[0]!).toMatchObject({
      input: { crdDir: "config/crd", exclude: ["policy.networking.k8s.io_*"] },
    });
  });

  test("rejects exclude on a non-crdDir input", () => {
    const input = { releaseAsset: "crds.yaml", exclude: ["x_*"] };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "input.exclude is only valid with crdDir",
    );
  });

  test("rejects an empty exclude list", () => {
    const input = { crdDir: "config/crd", exclude: [] };
    expect(() => parseSources({ sources: [validSource({ input })] })).toThrow(
      "input.exclude must be a non-empty array of non-empty globs",
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

describe("parseConfig projects", () => {
  test("accepts a project group and inherits category/cncf onto members", () => {
    const config = parseConfig(groupedDoc({ cncf: "graduated", pin: 4 }));
    expect(config.projects).toEqual([
      {
        name: "aws-ack",
        alias: "AWS Controllers for Kubernetes",
        category: "Provisioning",
        cncf: "graduated",
        pin: 4,
        url: "https://github.com/aws-controllers-k8s",
      },
    ]);
    for (const source of config.sources) {
      expect(source).toMatchObject({
        project: "aws-ack",
        category: "Provisioning",
        cncf: "graduated",
      });
      expect(source.pin).toBeUndefined();
    }
  });

  test("accepts an org-level project URL", () => {
    expect(parseConfig(groupedDoc()).projects[0]!.url).toBe("https://github.com/aws-controllers-k8s");
  });

  test("rejects non-GitHub project URLs", () => {
    expect(() => parseConfig(groupedDoc({ url: "https://gitlab.com/aws-controllers-k8s" }))).toThrow(
      "url must be https://github.com/<org>[/<name>]",
    );
  });

  test("rejects project URLs with a .git suffix", () => {
    expect(() =>
      parseConfig(groupedDoc({ url: "https://github.com/aws-controllers-k8s/s3-controller.git" })),
    ).toThrow("without a .git suffix");
  });

  test("rejects unknown project keys", () => {
    expect(() => parseConfig(groupedDoc({ repo: "aws-controllers-k8s" }))).toThrow(
      "projects[0] (aws-ack): unknown keys: repo",
    );
  });

  test("rejects duplicate project names", () => {
    const doc = groupedDoc();
    (doc.projects as unknown[]).push(validProject());
    expect(() => parseConfig(doc)).toThrow("projects[1]: duplicate name 'aws-ack'");
  });

  test("rejects invalid project categories and cncf levels", () => {
    expect(() => parseConfig(groupedDoc({ category: "Networking" }))).toThrow(
      `category must be one of: ${CATEGORIES.join(", ")}`,
    );
    expect(() => parseConfig(groupedDoc({ cncf: "archived" }))).toThrow(
      "cncf must be one of: graduated, incubating, sandbox",
    );
    expect(() => parseConfig(groupedDoc({ pin: 0 }))).toThrow("pin must be a positive integer");
  });

  test("rejects a member referencing an undeclared project", () => {
    expect(() =>
      parseConfig({ sources: [validSource({ category: undefined, project: "aws-ack" })] }),
    ).toThrow("sources[0] (gateway-api): unknown project 'aws-ack'");
  });

  test("rejects members setting inherited fields", () => {
    for (const field of [{ category: "Runtime" }, { cncf: "graduated" }, { pin: 3 }]) {
      expect(() => parseConfig(groupedDoc({}, [field, {}]))).toThrow(
        `${Object.keys(field)[0]} is inherited from project 'aws-ack'`,
      );
    }
  });

  test("rejects a project with fewer than two members", () => {
    expect(() => parseConfig(groupedDoc({}, [{}]))).toThrow(
      "project 'aws-ack' must have at least two member sources",
    );
  });

  test("rejects a project pin colliding with an ungrouped source pin", () => {
    const doc = groupedDoc({ pin: 4 });
    (doc.sources as unknown[]).push(validSource({ category: "Provisioning", pin: 4 }));
    expect(() => parseConfig(doc)).toThrow("duplicate pin 4 in category 'Provisioning'");
  });

  test("allows a project pin matching a source pin in another category", () => {
    const doc = groupedDoc({ pin: 4 });
    (doc.sources as unknown[]).push(validSource({ category: "Runtime", pin: 4 }));
    expect(parseConfig(doc).projects[0]!.pin).toBe(4);
  });

  test("allows a project named like its own member", () => {
    const config = parseConfig(groupedDoc({}, [{ name: "aws-ack" }, {}]));
    expect(config.sources[0]!).toMatchObject({ name: "aws-ack", project: "aws-ack" });
  });

  test("rejects a project named like a non-member source", () => {
    const doc = groupedDoc();
    (doc.sources as unknown[]).push(validSource({ name: "aws-ack" }));
    expect(() => parseConfig(doc)).toThrow(
      "source 'aws-ack' collides with project 'aws-ack' without being its member",
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

describe("repoOfProject", () => {
  test("extracts a bare organization from the URL", () => {
    expect(repoOfProject({ url: "https://github.com/aws-controllers-k8s" })).toBe("aws-controllers-k8s");
  });

  test("extracts owner/name from the URL", () => {
    expect(repoOfProject({ url: "https://github.com/kubernetes-sigs/karpenter" })).toBe("kubernetes-sigs/karpenter");
  });

  test("rejects URLs with extra path segments", () => {
    expect(() =>
      repoOfProject({ url: "https://github.com/aws-controllers-k8s/s3-controller/tree/main" }),
    ).toThrow("not a GitHub organization or repository URL");
  });
});
