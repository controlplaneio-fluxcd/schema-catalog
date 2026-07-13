// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";

type ProseToken =
  | { kind: "text"; text: string; href?: undefined }
  | { kind: "code"; text: string; href?: undefined }
  | { kind: "link"; text: string; href: string };

const jsonTreeModule = "../src/ui/json-tree.ts";
const { parseProse } = (await import(jsonTreeModule)) as { parseProse: (value: string) => ProseToken[] };

describe("parseProse", () => {
  test("strips backtick spans into code tokens", () => {
    expect(parseProse("One of `aws`, `azure`, or `gcp`.")).toEqual([
      { kind: "text", text: "One of " },
      { kind: "code", text: "aws" },
      { kind: "text", text: ", " },
      { kind: "code", text: "azure" },
      { kind: "text", text: ", or " },
      { kind: "code", text: "gcp" },
      { kind: "text", text: "." },
    ]);
  });

  test("parses markdown links with http and https hrefs", () => {
    expect(parseProse("Use [monitoring filter](https://cloud.google.com/monitoring/api/v3/filters).")).toEqual([
      { kind: "text", text: "Use " },
      {
        kind: "link",
        text: "monitoring filter",
        href: "https://cloud.google.com/monitoring/api/v3/filters",
      },
      { kind: "text", text: "." },
    ]);
  });

  test("keeps trailing bare URL punctuation out of hrefs", () => {
    const url = "https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources";

    expect(parseProse(`More info: ${url}.`)).toEqual([
      { kind: "text", text: "More info: " },
      { kind: "link", text: url, href: url },
      { kind: "text", text: "." },
    ]);
  });

  test("keeps balanced parens in bare URL hrefs", () => {
    const url = "https://en.wikipedia.org/wiki/Foo_(bar)";

    expect(parseProse(`See ${url} for details.`)).toEqual([
      { kind: "text", text: "See " },
      { kind: "link", text: url, href: url },
      { kind: "text", text: " for details." },
    ]);
  });

  test("trims unbalanced closing parens and stacked punctuation off bare URLs", () => {
    expect(parseProse("(see https://example.com/docs).")).toEqual([
      { kind: "text", text: "(see " },
      { kind: "link", text: "https://example.com/docs", href: "https://example.com/docs" },
      { kind: "text", text: ")." },
    ]);
  });

  test("parses markdown links whose URL contains parens", () => {
    expect(parseProse("Read [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) first.")).toEqual([
      { kind: "text", text: "Read " },
      { kind: "link", text: "Foo", href: "https://en.wikipedia.org/wiki/Foo_(bar)" },
      { kind: "text", text: " first." },
    ]);
  });

  test("parses plain http hrefs", () => {
    expect(parseProse("Legacy docs at http://example.com/docs")).toEqual([
      { kind: "text", text: "Legacy docs at " },
      { kind: "link", text: "http://example.com/docs", href: "http://example.com/docs" },
    ]);
  });

  test("stops bare URLs at adjacent markup", () => {
    expect(parseProse("https://example.com/`code` and https://example.com/[a](https://other.com)")).toEqual([
      { kind: "link", text: "https://example.com/", href: "https://example.com/" },
      { kind: "code", text: "code" },
      { kind: "text", text: " and " },
      { kind: "link", text: "https://example.com/", href: "https://example.com/" },
      { kind: "link", text: "a", href: "https://other.com" },
    ]);
  });

  test("keeps URLs inside backticks as code", () => {
    expect(parseProse("Set `https://example.com/path.` as a literal.")).toEqual([
      { kind: "text", text: "Set " },
      { kind: "code", text: "https://example.com/path." },
      { kind: "text", text: " as a literal." },
    ]);
  });

  test("preserves newlines in text tokens", () => {
    expect(parseProse("line one\nline two `code`\nline three")).toEqual([
      { kind: "text", text: "line one\nline two " },
      { kind: "code", text: "code" },
      { kind: "text", text: "\nline three" },
    ]);
  });

  test("returns one text token for plain text", () => {
    expect(parseProse("plain text with no markup")).toEqual([{ kind: "text", text: "plain text with no markup" }]);
  });

  test("does not link javascript URLs", () => {
    expect(parseProse("Do not use [bad](javascript:alert(1)) or javascript:alert(1).")).toEqual([
      { kind: "text", text: "Do not use [bad](javascript:alert(1)) or javascript:alert(1)." },
    ]);
  });
});
