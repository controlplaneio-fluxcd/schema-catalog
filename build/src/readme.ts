// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { CATEGORIES } from "./config.ts";
import type { SourceCategory } from "./types.ts";

/** The manifests are served from the website's history/ prefix. */
const HISTORY_URL = "https://schemas.fluxoperator.dev/history";

const VERSIONS_START = "<!-- versions:start -->";
const VERSIONS_END = "<!-- versions:end -->";
const STATS_START = "<!-- stats:start -->";
const STATS_END = "<!-- stats:end -->";

export interface VersionRow {
  /** Display name from the source's `alias`. */
  alias: string;
  /** CNCF landscape top-level group; controls README section placement. */
  category: SourceCategory;
  /** Source key; rendered as the ID column linking to the served manifest. */
  name: string;
  version: string;
  /** RFC 3339 build timestamp from the history manifest. */
  builtAt: string;
  /** Number of JSON Schemas the source contributes (`.json` files only). */
  schemas: number;
}

export function renderVersionsTable(rows: VersionRow[]): string {
  const sections: string[] = [];
  for (const category of CATEGORIES) {
    const categoryRows = rows
      .filter((row) => row.category === category)
      .sort((a, b) => {
        const aa = a.alias.toLowerCase();
        const bb = b.alias.toLowerCase();
        return aa < bb ? -1 : aa > bb ? 1 : 0;
      });
    if (categoryRows.length === 0) {
      continue;
    }

    const lines = [
      `### ${category}`,
      "",
      "| Project | ID | Version | Schemas | Updated |",
      "| --- | --- | --- | --- | --- |",
    ];
    for (const row of categoryRows) {
      const updated = row.builtAt.slice(0, 10);
      lines.push(
        `| ${row.alias} | [\`${row.name}\`](${HISTORY_URL}/${row.name}.json) | ${row.version} | ${row.schemas} | ${updated} |`,
      );
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}

/** Thousands-separated integer (2364 -> "2,364"), locale-independent. */
function groupDigits(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A shields.io flat-square badge as a markdown image. */
function badge(label: string, message: string, color: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, "--");
  return `![${label}](https://img.shields.io/badge/${enc(label)}-${enc(message)}-${color}?style=flat-square)`;
}

/**
 * Catalog summary badges rendered above the versions table. `projectCount` is
 * the number of presented projects: grouped sources count once via their
 * project group, matching the web UI and MCP.
 */
export function renderCatalogStats(rows: VersionRow[], sizeMB: number, projectCount: number): string {
  const schemas = rows.reduce((sum, row) => sum + row.schemas, 0);
  return [
    badge("Projects", groupDigits(projectCount), "2088FF"),
    badge("Schemas", groupDigits(schemas), "3FB950"),
    badge("Catalog size", `${groupDigits(sizeMB)} MB`, "8957E5"),
  ].join(" ");
}

/** Replaces the content between a start/end marker pair. */
function spliceBetween(readme: string, start: string, end: string, content: string): string {
  const from = readme.indexOf(start);
  const to = readme.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`README is missing the ${start} / ${end} markers`);
  }
  return `${readme.slice(0, from + start.length)}\n${content}\n${readme.slice(to)}`;
}

export function spliceVersionsTable(readme: string, table: string): string {
  return spliceBetween(readme, VERSIONS_START, VERSIONS_END, table);
}

export function spliceStats(readme: string, stats: string): string {
  return spliceBetween(readme, STATS_START, STATS_END, stats);
}

/** Rewrites the stats badges (under the title) and versions table in place. */
export async function updateReadme(
  path: string,
  rows: VersionRow[],
  sizeMB: number,
  projectCount: number,
): Promise<boolean> {
  const before = await Bun.file(path).text();
  const after = spliceStats(
    spliceVersionsTable(before, renderVersionsTable(rows)),
    renderCatalogStats(rows, sizeMB, projectCount),
  );
  if (after === before) {
    return false;
  }
  await Bun.write(path, after);
  return true;
}
