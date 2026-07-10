// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Dev-only stand-in for the bucket's `versions/` prefix: synthesizes
 * `versions/<source>/index.json` and the matching minor's `manifest.json`
 * from `build/history/<source>.json`, so the UI's versioned-snapshot fetches
 * work locally. Every source therefore lists exactly one minor in dev; the
 * real multi-minor data exists only in R2.
 */
import { join } from "node:path";
import { minorOf } from "./archive-versions.ts";

interface HistoryHead {
  version: string;
  commit: string;
  builtAt: string;
}

/** Answers a bucket-layout `versions/...` key from local history, or null. */
export async function devVersionsResponse(key: string, historyDir: string): Promise<Response | null> {
  const index = key.match(/^versions\/([a-z0-9-]+)\/index\.json$/);
  const manifest = key.match(/^versions\/([a-z0-9-]+)\/([a-z0-9.-]+)\/manifest\.json$/);
  const name = index?.[1] ?? manifest?.[1];
  if (name === undefined) {
    return null;
  }
  const file = Bun.file(join(historyDir, `${name}.json`));
  if (!(await file.exists())) {
    return null;
  }
  const entry = (await file.json()) as HistoryHead;
  const minor = minorOf(entry.version);
  if (index !== null) {
    return Response.json([
      { minor, version: entry.version, commit: entry.commit, builtAt: entry.builtAt },
    ]);
  }
  return manifest?.[2] === minor ? new Response(file) : null;
}
