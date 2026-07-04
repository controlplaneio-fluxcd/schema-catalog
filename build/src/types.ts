/** flux-schema extract subcommand; k8s and openshift fetch their own swagger. */
export type ExtractKind = "k8s" | "openshift" | "crd";

/** Where the CRD YAML piped into `flux-schema extract crd` comes from. */
export type CrdInput =
  | { kustomize: string }
  | { releaseAsset: string }
  | { fluxInstance: FluxInstance };

/**
 * Inputs for `flux-operator build instance`; spec.distribution.version is
 * set to the resolved source version at build time.
 */
export interface FluxInstance {
  registry: string;
  components: string[];
}

interface SourceBase {
  /** Unique key; also the history file name under build/history/. */
  name: string;
  /** Display name for the README versions table and field-index headers. */
  alias: string;
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
  /** Catalog files owned by this source, repo-root relative, sorted. */
  files: string[];
}
