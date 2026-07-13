// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { buildFieldTree, filterFieldLines, parseFieldsFile } from "../src/shared/fields.ts";

const sample = `# schema source: Kubernetes v1.36.2 https://github.com/kubernetes/kubernetes
apiVersion <string> enum=apiextensions.k8s.io/v1
kind <string> enum=CustomResourceDefinition (cluster-scoped)
metadata.name <string> (required)
spec <object> (required)\t# spec describes how the user wants the resources to appear
spec.conversion.webhook.clientConfig.caBundle <string> format=byte\t# caBundle is a PEM encoded CA bundle...
spec.versions <[]object>\t# versions are API versions
spec.versions[].name <string> (required)\t# name is the version name, e.g. v1
spec.template.spec.containers[].image <string>\t# Container Image
spec.template.spec.containers[].resources.limits.cpu <string>\t# CPU limit
`;

describe("parseFieldsFile", () => {
  test("skips comments and splits fields lines", () => {
    const lines = parseFieldsFile(sample);

    expect(lines).toHaveLength(9);
    expect(lines[0]).toMatchObject({
      path: "apiVersion",
      type: "<string>",
      constraints: "enum=apiextensions.k8s.io/v1",
      description: "",
    });
    expect(lines[3]).toMatchObject({
      path: "spec",
      type: "<object>",
      constraints: "(required)",
      description: "spec describes how the user wants the resources to appear",
    });
    expect(lines[4]).toMatchObject({
      path: "spec.conversion.webhook.clientConfig.caBundle",
      type: "<string>",
      constraints: "format=byte",
      description: "caBundle is a PEM encoded CA bundle...",
    });
  });
});

describe("filterFieldLines", () => {
  test("filters by prefix and case-insensitive query with limit and total", () => {
    const lines = parseFieldsFile(sample);
    const byPrefix = filterFieldLines(lines, { prefix: "spec.conversion" });
    const byQuery = filterFieldLines(lines, { query: "pem", limit: 1 });

    expect(byPrefix.total).toBe(1);
    expect(byPrefix.matches[0]?.path).toBe("spec.conversion.webhook.clientConfig.caBundle");
    expect(byQuery.total).toBe(1);
    expect(byQuery.matches).toHaveLength(1);
    expect(byQuery.matches[0]?.description).toContain("PEM");
  });

  test("filters by case-insensitive regex query", () => {
    const lines = parseFieldsFile(sample);
    const byRegex = filterFieldLines(lines, { query: "spec\\..*image", queryMode: "regex" });
    const byCase = filterFieldLines(lines, { query: "container image", queryMode: "regex" });

    expect(byRegex.total).toBe(1);
    expect(byRegex.matches[0]?.path).toBe("spec.template.spec.containers[].image");
    expect(byCase.total).toBe(1);
    expect(byCase.matches[0]?.description).toBe("Container Image");
  });

  test("falls back to substring matching for invalid UI regex", () => {
    const lines = parseFieldsFile(sample);
    const fallback = filterFieldLines(lines, { query: "[", queryMode: "regex-or-substring" });

    expect(fallback.total).toBe(4);
    expect(fallback.matches.map((line) => line.path)).toEqual([
      "spec.versions",
      "spec.versions[].name",
      "spec.template.spec.containers[].image",
      "spec.template.spec.containers[].resources.limits.cpu",
    ]);
  });

  test("composes prefix and regex filters", () => {
    const lines = parseFieldsFile(sample);
    const filtered = filterFieldLines(lines, {
      prefix: "spec.template",
      query: "(limits|requests)\\.cpu",
      queryMode: "regex",
    });

    expect(filtered.total).toBe(1);
    expect(filtered.matches[0]?.path).toBe("spec.template.spec.containers[].resources.limits.cpu");
  });
});

describe("buildFieldTree", () => {
  test("nests array path segments as plain names", () => {
    const tree = buildFieldTree(parseFieldsFile(sample));
    const name = tree.children.get("spec")?.children.get("versions")?.children.get("name");

    expect(name?.line?.path).toBe("spec.versions[].name");
  });

  test("merges array field and item field segments", () => {
    const tree = buildFieldTree(parseFieldsFile(sample));
    const versions = tree.children.get("spec")?.children.get("versions");

    expect(versions?.line?.path).toBe("spec.versions");
    expect(versions?.line?.type).toBe("<[]object>");
    expect(versions?.children.get("name")?.line?.path).toBe("spec.versions[].name");
  });
});
