// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { checkAssetBudget, countAssetFiles } from "../scripts/copy-catalog.ts";

describe("countAssetFiles", () => {
  test("counts all nested assets, including hidden files, but excludes root metadata", async () => {
    const directory = `.copy-catalog-test-${crypto.randomUUID()}`;
    const uploaded = [
      "index.html",
      "main.js",
      "_headers.txt",
      ".hidden",
      ".git/config",
      ".well-known/mcp/server-card.json",
      "catalog/example.io/kind_v1.json",
      "catalog/example.io/kind_v1.fields.txt",
      "catalog/example.io/_headers",
      "catalog/example.io/_redirects",
      "catalog/example.io/.assetsignore",
    ];
    try {
      await mkdir(join(directory, "empty"), { recursive: true });
      for (const file of [...uploaded, "_headers", "_redirects", ".assetsignore"]) {
        await Bun.write(join(directory, file), "");
      }
      expect(await countAssetFiles(directory)).toBe(uploaded.length);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("checkAssetBudget", () => {
  test.each([
    [0, true],
    [89_999, true],
    [90_000, false],
    [100_001, false],
  ] as const)("count %i returns %s", (count, expected) => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(checkAssetBudget(count)).toBe(expected);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        `asset file budget: ${count} / 100000 files (${((count / 100_000) * 100).toFixed(3)}%); threshold: 90000 files (90%)`,
      );
      if (expected) {
        expect(error).not.toHaveBeenCalled();
      } else {
        expect(error).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
          `Asset file budget exceeded: count ${count}, limit 100000, threshold 90000 (90%); shard the catalog or exclude prefixes from the packaged assets.`,
        );
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test("exits unsuccessfully with stderr at the threshold in a child Bun process", () => {
    const moduleUrl = new URL("../scripts/copy-catalog.ts", import.meta.url).href;
    const result = Bun.spawnSync([
      process.execPath,
      "-e",
      `import { checkAssetBudget } from ${JSON.stringify(moduleUrl)}; if (!checkAssetBudget(9, 10)) process.exit(1);`,
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toBe(
      "asset file budget: 9 / 10 files (90.000%); threshold: 9 files (90%)\n",
    );
    expect(result.stderr.toString()).toBe(
      "Asset file budget exceeded: count 9, limit 10, threshold 9 (90%); shard the catalog or exclude prefixes from the packaged assets.\n",
    );
  });
});
