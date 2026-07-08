// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import type { CatalogIndex } from "../src/shared/types.ts";
import {
  findProject,
  formatGrepSchemaResponse,
  getSchemaText,
  grepCatalogText,
  grepSchemaText,
  kindNotFoundMessage,
  listProjectsText,
  MAX_SCHEMA_INLINE_BYTES,
  projectText,
  projectNotFoundMessage,
  resolveKind,
  sizeGuardText,
} from "../src/worker/mcp-core.ts";
import type { CatalogObjectLoader } from "../src/worker/mcp-core.ts";
import type { Env } from "../src/worker/index.ts";

const index: CatalogIndex = {
  v: 4,
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
          kinds: [["kustomization", ["v1", "v1beta2"], 1, "Kustomization", { n: ["ks"] }]],
        },
      ],
    },
    {
      // A grouped project: no version, member sources listed instead.
      name: "aws-ack",
      alias: "AWS Controllers for Kubernetes",
      cat: 0,
      repo: "aws-controllers-k8s",
      builtAt: "2026-07-06",
      sources: [
        { name: "ack-s3", alias: "AWS S3 Controller", repo: "aws-controllers-k8s/s3-controller", version: "v1.8.1", builtAt: "2026-07-06" },
        { name: "ack-sqs", alias: "AWS SQS Controller", repo: "aws-controllers-k8s/sqs-controller", version: "v1.4.0", builtAt: "2026-07-05" },
      ],
      groups: [
        { g: "s3.services.k8s.aws", kinds: [["bucket", ["v1alpha1"], 1, "Bucket"]], src: [0] },
        { g: "sqs.services.k8s.aws", kinds: [["queue", ["v1alpha1"], 0]], src: [1] },
      ],
    },
    {
      name: "kubernetes",
      alias: "Kubernetes",
      cat: 2,
      repo: "kubernetes/kubernetes",
      version: "v1.34.0",
      builtAt: "2026-07-06",
      groups: [
        { g: "core", kinds: [["pod", ["v1"], 1, "Pod", { p: "pods", n: ["po"] }]] },
        { g: "apps", kinds: [["deployment", ["v1"], 1, "Deployment"]] },
      ],
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
  test("grepCatalogText returns TypeMeta lines and a matched footer", () => {
    expect(grepCatalogText(index, "fluxcd", 10)).toBe(
      [
        "kustomize.toolkit.fluxcd.io/v1 Kustomization (ks)\t# fluxcd",
        "kustomize.toolkit.fluxcd.io/v1beta2 Kustomization (ks)\t# fluxcd, no fields index",
        "# matched 2 of 6 schemas",
      ].join("\n"),
    );

    expect(grepCatalogText(index, "^v1 Pod", 10)).toBe("v1 Pod (pods, po)\t# kubernetes\n# matched 1 of 6 schemas");
  });

  test("grepCatalogText attributes grouped kinds to the project group name", () => {
    expect(grepCatalogText(index, "queue", 10)).toBe(
      "sqs.services.k8s.aws/v1alpha1 queue\t# aws-ack, no fields index\n# matched 1 of 6 schemas",
    );
  });

  test("grepCatalogText matches short names and irregular resource names", () => {
    expect(grepCatalogText(index, "\\bks\\b", 10)).toBe(
      [
        "kustomize.toolkit.fluxcd.io/v1 Kustomization (ks)\t# fluxcd",
        "kustomize.toolkit.fluxcd.io/v1beta2 Kustomization (ks)\t# fluxcd, no fields index",
        "# matched 2 of 6 schemas",
      ].join("\n"),
    );

    expect(grepCatalogText(index, "\\bpo\\b", 10)).toBe("v1 Pod (pods, po)\t# kubernetes\n# matched 1 of 6 schemas");
  });

  test("grepCatalogText reports invalid regex as a tool result", () => {
    const text = grepCatalogText(index, "[", 20);

    expect(text.startsWith('invalid regex "[":')).toBe(true);
    expect(text).toContain("Invalid regular expression");
  });

  test("listProjectsText returns one line per project and a project footer", () => {
    expect(listProjectsText(index)).toBe(
      [
        "fluxcd v2.8.0 github.com/fluxcd/flux2 1 kinds",
        "aws-ack 2 repos github.com/aws-controllers-k8s 2 kinds",
        "kubernetes v1.34.0 github.com/kubernetes/kubernetes 2 kinds",
        "# 3 projects",
      ].join("\n"),
    );
  });

  test("findProject matches names and aliases, and member sources resolve to their group", () => {
    expect(findProject(index, "fluxcd")?.name).toBe("fluxcd");
    expect(findProject(index, "Flux CD")?.name).toBe("fluxcd");
    expect(findProject(index, "aws-ack")?.name).toBe("aws-ack");
    expect(findProject(index, "ack-s3")?.name).toBe("aws-ack");
    expect(findProject(index, "AWS SQS Controller")?.name).toBe("aws-ack");
    expect(findProject(index, "aws-controllers-k8s")).toBeUndefined();
  });

  test("projectText returns a header, version lines, and no-fields comments", () => {
    const project = index.projects[0]!;

    expect(projectText(project)).toBe(
      [
        "# fluxcd v2.8.0 github.com/fluxcd/flux2",
        "kustomize.toolkit.fluxcd.io/v1 Kustomization (ks)",
        "kustomize.toolkit.fluxcd.io/v1beta2 Kustomization (ks)\t# no fields index",
      ].join("\n"),
    );
  });

  test("projectText lists grouped members with their own version and repo", () => {
    const awsAck = index.projects[1]!;

    expect(projectText(awsAck)).toBe(
      [
        "# aws-ack github.com/aws-controllers-k8s (2 sources)",
        "# source: ack-s3 v1.8.1 github.com/aws-controllers-k8s/s3-controller",
        "# source: ack-sqs v1.4.0 github.com/aws-controllers-k8s/sqs-controller",
        "s3.services.k8s.aws/v1alpha1 Bucket",
        "sqs.services.k8s.aws/v1alpha1 queue\t# no fields index",
      ].join("\n"),
    );
  });

  test("size guard allows 262144 bytes and refuses 262145 bytes", () => {
    expect(sizeGuardText("example.io", "tiny", "v1", MAX_SCHEMA_INLINE_BYTES)).toBeUndefined();

    const refusal = sizeGuardText("example.io", "huge", "v1", MAX_SCHEMA_INLINE_BYTES + 1);
    expect(refusal).toContain("262145 bytes");
    expect(refusal).toContain("https://schemas.fluxoperator.dev/catalog/example.io/huge_v1.json");
    expect(refusal).toContain("grep_schema");
  });

  test("formatGrepSchemaResponse returns raw lines with matched footer", () => {
    const fields = [
      "spec <object> (required)\t# desired state",
      "spec.prune <boolean>\t# prune stale resources",
      "status <object>\t# observed state",
    ].join("\n");

    expect(formatGrepSchemaResponse(fields, { query: "prune", limit: 200 })).toBe(
      "spec.prune <boolean>\t# prune stale resources\n# matched 1 of 3 fields",
    );
  });

  test("not-found messages include helpful close matches", () => {
    expect(projectNotFoundMessage(index, "flux")).toContain("Flux CD (fluxcd)");
    expect(kindNotFoundMessage(index, "kustomize.toolkit.fluxcd.io", "kustomiztion")).toContain(
      "kustomize.toolkit.fluxcd.io/v1 Kustomization",
    );
  });

  test("project suggestions consider grouped member names and aliases", () => {
    const suggestions = projectNotFoundMessage(index, "s3");
    expect(suggestions).toContain("AWS Controllers for Kubernetes (aws-ack)");
  });

  test("resolveKind is case-insensitive for kind names", () => {
    const resolved = resolveKind(index, "kustomize.toolkit.fluxcd.io", "Kustomization");

    expect(resolved?.entry[0]).toBe("kustomization");
  });

  test("resolveKind matches compact resource aliases", () => {
    const resolved = resolveKind(index, "kustomize.toolkit.fluxcd.io", "ks");

    expect(resolved?.entry[0]).toBe("kustomization");
  });

  test("resolveKind attributes grouped kinds to their owning member source", () => {
    expect(resolveKind(index, "s3.services.k8s.aws", "bucket")?.source?.name).toBe("ack-s3");
    expect(resolveKind(index, "sqs.services.k8s.aws", "queue")?.source?.name).toBe("ack-sqs");
    expect(resolveKind(index, "kustomize.toolkit.fluxcd.io", "kustomization")?.source).toBeUndefined();
  });

  test("getSchemaText uses the loader and returns the size guard instead of large bodies", async () => {
    const loader: CatalogObjectLoader = async () => ({
      body: new Response("{\"too\":\"large\"}").body!,
      etag: "\"test\"",
      size: MAX_SCHEMA_INLINE_BYTES + 1,
    });

    const text = await getSchemaText(index, env, { apiVersion: "sqs.services.k8s.aws", kind: "queue" }, loader);

    expect(text).toContain("exceeds the 262144 byte inline response limit");
    expect(text).toContain("https://schemas.fluxoperator.dev/catalog/sqs.services.k8s.aws/queue_v1alpha1.json");
  });

  test("getSchemaText resolves apiVersion slash, bare group, bare core version, and core alias forms", async () => {
    const loaded: string[] = [];
    const loader: CatalogObjectLoader = async (_env, key) => {
      loaded.push(key);
      return {
        body: new Response(key).body!,
        etag: "\"test\"",
        size: key.length,
      };
    };

    await expect(
      getSchemaText(index, env, { apiVersion: "kustomize.toolkit.fluxcd.io/v1beta2", kind: "Kustomization" }, loader),
    ).resolves.toBe("kustomize.toolkit.fluxcd.io/kustomization_v1beta2.json");
    await expect(
      getSchemaText(index, env, { apiVersion: "kustomize.toolkit.fluxcd.io", kind: "kustomization" }, loader),
    ).resolves.toBe("kustomize.toolkit.fluxcd.io/kustomization_v1.json");
    await expect(getSchemaText(index, env, { apiVersion: "v1", kind: "pod" }, loader)).resolves.toBe(
      "core/pod_v1.json",
    );
    await expect(getSchemaText(index, env, { apiVersion: "core/v1", kind: "Pod" }, loader)).resolves.toBe(
      "core/pod_v1.json",
    );

    expect(loaded).toEqual([
      "kustomize.toolkit.fluxcd.io/kustomization_v1beta2.json",
      "kustomize.toolkit.fluxcd.io/kustomization_v1.json",
      "core/pod_v1.json",
      "core/pod_v1.json",
    ]);
  });

  test("getSchemaText reports unavailable apiVersions in manifest form", async () => {
    const loader: CatalogObjectLoader = async () => {
      throw new Error("loader should not be called when apiVersion is unavailable");
    };

    const text = await getSchemaText(
      index,
      env,
      { apiVersion: "kustomize.toolkit.fluxcd.io/v2", kind: "Kustomization" },
      loader,
    );

    expect(text).toContain('apiVersion "kustomize.toolkit.fluxcd.io/v2" is not available');
    expect(text).toContain(
      "Available apiVersions: kustomize.toolkit.fluxcd.io/v1, kustomize.toolkit.fluxcd.io/v1beta2",
    );
  });

  test("grepSchemaText reports schema URL when a kind has no fields file", async () => {
    const loader: CatalogObjectLoader = async () => {
      throw new Error("loader should not be called when fieldsBits is empty");
    };

    const text = await grepSchemaText(
      index,
      env,
      { apiVersion: "sqs.services.k8s.aws", kind: "queue", limit: 200 },
      loader,
    );

    expect(text).toContain("No fields index is available");
    expect(text).toContain("https://schemas.fluxoperator.dev/catalog/sqs.services.k8s.aws/queue_v1alpha1.json");
  });

  test("grepSchemaText opens with a resolved-source header and ends with a hash matched footer", async () => {
    const loader: CatalogObjectLoader = async () => ({
      body: new Response(
        ["spec <object>\t# desired state", "spec.template.spec.containers[].image <string>\t# image"].join("\n"),
      ).body!,
      etag: "\"test\"",
      size: 96,
    });

    const text = await grepSchemaText(
      index,
      env,
      { apiVersion: "kustomize.toolkit.fluxcd.io", kind: "Kustomization", query: "image", limit: 200 },
      loader,
    );

    expect(text).toBe(
      [
        "# kustomize.toolkit.fluxcd.io/v1 Kustomization from fluxcd v2.8.0 github.com/fluxcd/flux2",
        "spec.template.spec.containers[].image <string>\t# image",
        "# matched 1 of 2 fields",
      ].join("\n"),
    );
  });

  test("grepSchemaText header attributes grouped kinds to the owning source and its version", async () => {
    const loader: CatalogObjectLoader = async () => ({
      body: new Response("spec.name <string>\t# bucket name").body!,
      etag: "\"test\"",
      size: 48,
    });

    const text = await grepSchemaText(
      index,
      env,
      { apiVersion: "s3.services.k8s.aws", kind: "Bucket", query: "name", limit: 200 },
      loader,
    );

    expect(text).toBe(
      [
        "# s3.services.k8s.aws/v1alpha1 Bucket from ack-s3 v1.8.1 github.com/aws-controllers-k8s/s3-controller",
        "spec.name <string>\t# bucket name",
        "# matched 1 of 1 fields",
      ].join("\n"),
    );
  });

  test("grepSchemaText reports invalid regex as a tool result", async () => {
    const loader: CatalogObjectLoader = async () => ({
      body: new Response("spec.template.spec.containers[].image <string>\t# image").body!,
      etag: "\"test\"",
      size: 64,
    });

    const text = await grepSchemaText(
      index,
      env,
      { apiVersion: "kustomize.toolkit.fluxcd.io", kind: "kustomization", query: "[", limit: 200 },
      loader,
    );

    expect(text.startsWith('invalid regex "[":')).toBe(true);
    expect(text).toContain("Invalid regular expression");
  });
});
