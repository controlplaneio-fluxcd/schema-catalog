// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { displayVersion } from "./resolve.ts";

/** A source rebuilt during this run, for the PR body. */
export interface BuildChange {
  repo: string;
  /** null on the first build of a source. */
  prevVersion: string | null;
  version: string;
  files: number;
  added: number;
  removed: number;
}

/** A source GC'd because it left sources.yaml. */
export interface OrphanRemoval {
  name: string;
  files: number;
}

/**
 * Renders the markdown summary of a build run: one row per changed source,
 * never the full catalog.
 */
export function renderBuildSummary(
  changes: BuildChange[],
  orphans: OrphanRemoval[],
  upToDate: number,
): string {
  const lines = ["Automated update of the schema catalog."];
  if (changes.length > 0) {
    lines.push(
      "",
      "| Source | Version | Files |",
      "| --- | --- | --- |",
      ...changes.map((c) => {
        const version =
          c.prevVersion === null || c.prevVersion === c.version
            ? displayVersion(c.version)
            : `${displayVersion(c.prevVersion)} -> ${displayVersion(c.version)}`;
        const delta = c.added > 0 || c.removed > 0 ? ` (+${c.added} -${c.removed})` : "";
        return `| [${c.repo}](https://github.com/${c.repo}) | ${version} | ${c.files}${delta} |`;
      }),
    );
  }
  for (const orphan of orphans) {
    lines.push("", `Removed \`${orphan.name}\` (${orphan.files} files): no longer in sources.yaml.`);
  }
  if (changes.length === 0 && orphans.length === 0) {
    lines.push("", "No changes.");
  }
  if (upToDate > 0) {
    lines.push("", `${upToDate} source(s) already up to date.`);
  }
  return `${lines.join("\n")}\n`;
}
