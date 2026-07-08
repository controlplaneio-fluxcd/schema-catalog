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
  v: 4;
  /** ISO timestamp for when `scripts/gen-index.ts` wrote the asset. */
  generatedAt: string;
  /** CNCF category names; `ProjectEntry.cat` stores an index into this array. */
  categories: readonly string[];
  /** Projects sorted by display alias for stable UI and MCP output. */
  projects: ProjectEntry[];
}

/**
 * One presented project: either a single source from `build/config/sources.yaml`
 * joined with its latest `build/history` manifest, or a project group merging
 * several member sources (then `sources` lists the members and `version` is
 * absent). `name` is the stable config key, `alias` is display text, and
 * `builtAt` is truncated to `YYYY-MM-DD` for compact UI rendering.
 */
export interface ProjectEntry {
  name: string;
  alias: string;
  cat: number;
  /** GitHub owner/name; a bare organization for some grouped projects. */
  repo: string;
  /** Resolved release version; absent on grouped projects (see `sources`). */
  version?: string;
  /** Full resolved tag (the git ref); present only when it differs from `version`. */
  ref?: string;
  /** Build date; the latest member build date for grouped projects. */
  builtAt: string;
  /** Set when the source belongs to a CNCF project; value is the project maturity. */
  cncf?: "graduated" | "incubating" | "sandbox";
  /** Landing-page preview order within the category; lower shows first, unpinned follow alphabetically. */
  pin?: number;
  /** Member sources merged into this project; present only on grouped entries. */
  sources?: ProjectSourceEntry[];
  groups: GroupEntry[];
}

/** One member source of a grouped project, sorted by alias. */
export interface ProjectSourceEntry {
  name: string;
  alias: string;
  repo: string;
  version: string;
  /** Full resolved tag (the git ref); present only when it differs from `version`. */
  ref?: string;
  builtAt: string;
}

/**
 * Catalog API group entry. The group name `g` is the lowercase catalog directory
 * name emitted by the build, and kinds are sorted by lowercase kind filename for
 * deterministic lookup and rendering.
 */
export interface GroupEntry {
  g: string;
  kinds: KindEntry[];
  /**
   * Owning member per kind, parallel to `kinds`: an index into the project's
   * `sources` array. Present only on grouped projects, where it attributes
   * each kind to the member source (and its version) that built it.
   */
  src?: number[];
}

/**
 * Compact discovery names for kubectl-style resource references. `s` is only
 * set when singular differs from `kind`, `p` is only set when plural cannot be
 * derived from `kind`, and `n` contains short names in discovery order. The API
 * group is stored once on `GroupEntry.g`, never repeated here.
 */
export interface ResourceEntry {
  s?: string;
  p?: string;
  n?: string[];
}

/**
 * Compact kind tuple: `[kind, versions, fieldsBits, display?, resource?]`.
 * `kind` is the lowercase catalog slug used for object paths, routes, and
 * lookups. `versions` is sorted by Kubernetes API priority with the latest
 * version at index 0; bit `i` in `fieldsBits` is set when `versions[i]` has a
 * sibling `.fields.txt` index. `display` is the original-cased kind name for UI
 * text and is omitted when it equals `kind`; read it through `kindDisplay`.
 * `resource` carries only discovery-name exceptions needed for resource
 * reference lookup and completion.
 */
export type KindEntry = [kind: string, versions: string[], fieldsBits: number, display?: string, resource?: ResourceEntry];
