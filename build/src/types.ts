// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/** flux-schema extract subcommand; k8s and openshift fetch their own swagger. */
export type ExtractKind = "k8s" | "openshift" | "crd";

export type SourceCategory =
  | "Provisioning"
  | "Runtime"
  | "Orchestration & Management"
  | "App Definition & Development"
  | "Observability & Analysis"
  | "Platform";

/** Where the CRD YAML piped into `flux-schema extract crd` comes from. */
export type CrdInput = CrdInputBase &
  (
    | { kustomize: string }
    | { releaseAsset: string }
    | { crdDir: string; exclude?: string[] }
    | { crdFile: string }
    | { fluxInstance: FluxInstance }
  );

interface CrdInputBase {
  /**
   * Optional glob constraining which release tags version resolution considers
   * (e.g. `v*`). Use for repos that interleave unrelated release tags GitHub's
   * /releases/latest would surface (external-secrets ships `helm-chart-*`
   * releases alongside the app `v*` releases). Ignored when `version` is pinned.
   */
  releaseTag?: string;
}

/**
 * Inputs for `flux-operator build instance`; spec.distribution.version is
 * set to the resolved source version at build time.
 */
export interface FluxInstance {
  registry: string;
  components: string[];
}

/**
 * Display metadata for a project group. Member sources reference it via
 * `project: <name>` and inherit `category`/`cncf`; the web index and MCP
 * present the members as this one project. Build outputs stay per-source.
 */
export interface ProjectGroup {
  /** Unique key referenced by member sources; also the web project route. */
  name: string;
  /** Display name for the web UI and MCP. */
  alias: string;
  /** CNCF landscape top-level group, inherited by member sources. */
  category: SourceCategory;
  /** CNCF project maturity, inherited by member sources. */
  cncf?: "graduated" | "incubating" | "sandbox";
  /** Landing-page preview order within the category, shared with source pins. */
  pin?: number;
  /** GitHub organization or repository URL for the project page link. */
  url: string;
}

interface SourceBase {
  /** Unique key; also the history file name under build/history/. */
  name: string;
  /** Display name for the README versions table and field-index headers. */
  alias: string;
  /**
   * CNCF landscape top-level group. Inherited from the project group when
   * `project` is set; parsing fills it in.
   */
  category: SourceCategory;
  /**
   * CNCF project maturity from the CNCF landscape (landscape.cncf.io); set only
   * for sources belonging to a CNCF project. Inherited from the project group
   * when `project` is set.
   */
  cncf?: "graduated" | "incubating" | "sandbox";
  /** Landing-page preview order within the category; lower shows first, unpinned follow alphabetically. */
  pin?: number;
  /**
   * Optional project-group key from the top-level `projects:` list; members
   * inherit the group's category/cncf and present as one project in the web
   * UI and MCP.
   */
  project?: string;
  /** GitHub repository URL; drives version resolution. */
  url: string;
  /** Optional pin; defaults to the latest release (openshift: release branch). */
  version?: string;
}

export interface K8sSource extends SourceBase {
  extract: "k8s";
}

export interface OpenShiftSource extends SourceBase {
  extract: "openshift";
}

export interface CrdSource extends SourceBase {
  extract: "crd";
  input: CrdInput;
}

export type Source = K8sSource | OpenShiftSource | CrdSource;

/** Parsed sources.yaml: the flat source list plus the project groups. */
export interface CatalogConfig {
  sources: Source[];
  projects: ProjectGroup[];
}

/** Kubernetes discovery names for kubectl-style resource references. */
export interface ResourceNames {
  /** Singular resource name reported by discovery. */
  singular?: string;
  /** Plural resource name reported by discovery. */
  plural?: string;
  /** Short names reported by discovery, in discovery order. */
  shortNames?: string[];
}

/** Last successful build result, stored at build/history/<name>.json. */
export interface HistoryEntry {
  name: string;
  /** GitHub repository in owner/name form. */
  repo: string;
  /** Resolved version the catalog files were extracted from. */
  version: string;
  /** RFC 3339 timestamp of the build. */
  builtAt: string;
  /** Version of the flux-schema binary that produced the files. */
  fluxSchemaVersion: string;
  /**
   * Original-cased kind identifiers `<group>/<Kind>` for every kind that has a
   * field index, sorted and unique, mapped to discovery names. Catalog filenames
   * lowercase the kind, so the key is the only record of the real casing (e.g.
   * `.../ArchiveRule`) the web index uses for display; the slug is recovered by
   * lowercasing. An empty object means the extractor had no discovery names for
   * that kind.
   */
  kinds: Record<string, ResourceNames>;
  /** Catalog files owned by this source, repo-root relative, sorted. */
  files: string[];
}
