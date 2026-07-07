// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Generated catalog search index consumed by the Worker, UI, MCP helpers, and
 * tests. Version `v` is the schema version for this compact JSON contract; new
 * incompatible layouts must increment it because deployed Workers may memoize
 * an index for the lifetime of a `CATALOG_VERSION`.
 */
export interface CatalogIndex {
  /** Index contract version. */
  v: 2;
  /** ISO timestamp for when `scripts/gen-index.ts` wrote the asset. */
  generatedAt: string;
  /** CNCF category names; `ProjectEntry.cat` stores an index into this array. */
  categories: readonly string[];
  /** Projects sorted by display alias for stable UI and MCP output. */
  projects: ProjectEntry[];
}

/**
 * One source project from `build/config/sources.yaml` joined with its latest
 * `build/history` manifest. `name` is the stable config key, `alias` is display
 * text, and `builtAt` is truncated to `YYYY-MM-DD` for compact UI rendering.
 */
export interface ProjectEntry {
  name: string;
  alias: string;
  cat: number;
  repo: string;
  version: string;
  builtAt: string;
  /** Set when the source belongs to a CNCF graduated project. */
  cncf?: "graduated";
  /** Landing-page preview order within the category; lower shows first, unpinned follow alphabetically. */
  pin?: number;
  groups: GroupEntry[];
}

/**
 * Catalog API group entry. The group name `g` is the lowercase catalog directory
 * name emitted by the build, and kinds are sorted by lowercase kind filename for
 * deterministic lookup and rendering.
 */
export interface GroupEntry {
  g: string;
  kinds: KindEntry[];
}

/**
 * Compact kind tuple: `[kind, versions, fieldsBits, display?]`. `kind` is the
 * lowercase catalog slug used for object paths, routes, and lookups. `versions`
 * is sorted by Kubernetes API priority with the preferred/latest version at
 * index 0; bit `i` in `fieldsBits` is set when `versions[i]` has a sibling
 * `.fields.txt` index. `display` is the original-cased kind name for UI text and
 * is omitted when it equals `kind`; read it through `kindDisplay`.
 */
export type KindEntry = [kind: string, versions: string[], fieldsBits: number, display?: string];
