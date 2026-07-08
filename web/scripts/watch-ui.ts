// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { watch } from "node:fs";
import { join } from "node:path";

/**
 * Watches `src/` and rebundles the UI when a file the UI bundle depends on
 * changes, optionally notifying callers after a successful rebuild. Worker-only
 * edits are ignored because `wrangler dev` reloads them itself. Rebuilds are
 * debounced and serialized so bursts of saves collapse into one build and never
 * overlap.
 */
export function watchUi(webRoot: string, onRebuilt?: () => void): ReturnType<typeof watch> {
  const srcDir = join(webRoot, "src");
  const buildScript = join(import.meta.dir, "build-ui.ts");
  let building = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const rebuild = async (): Promise<void> => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    const proc = Bun.spawn(["bun", buildScript], { cwd: webRoot, stdout: "inherit", stderr: "inherit" });
    const code = await proc.exited;
    building = false;
    if (code === 0) {
      console.log("[dev] UI rebuilt");
      onRebuilt?.();
    } else {
      console.log(`[dev] UI build failed (exit ${code})`);
    }
    if (pending) {
      pending = false;
      await rebuild();
    }
  };

  const watcher = watch(srcDir, { recursive: true }, (_event, filename) => {
    if (filename === null) {
      return;
    }
    const path = filename.replaceAll("\\", "/");
    if (!path.startsWith("ui/") && !path.startsWith("shared/")) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 80);
  });

  console.log(`[dev] watching ${srcDir} -> rebundling UI on ui/ and shared/ changes`);
  return watcher;
}
