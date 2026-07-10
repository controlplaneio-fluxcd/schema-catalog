// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, test } from "bun:test";
import { minorOf } from "../scripts/archive-versions.ts";

describe("minorOf", () => {
  test("strips the patch from major.minor.patch versions", () => {
    expect(minorOf("v1.36.2")).toBe("v1.36");
    expect(minorOf("0.51.0")).toBe("0.51");
  });

  test("keeps minor-only versions as-is", () => {
    expect(minorOf("v4.20")).toBe("v4.20");
  });

  test("keeps prefixed tags up to their major.minor tail", () => {
    expect(minorOf("gha-runner-scale-set-0.14.2")).toBe("gha-runner-scale-set-0.14");
  });

  test("keeps versions with no parsable major.minor tail", () => {
    expect(minorOf("nightly")).toBe("nightly");
  });
});
