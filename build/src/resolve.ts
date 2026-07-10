// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { fetchRetry, latestReleaseTag, listReleases, matchAsset, type Release } from "./github.ts";
import { repoOf } from "./config.ts";
import type { Source } from "./types.ts";

const CINCINNATI_URL = "https://api.openshift.com/api/upgrades_info/v1/graph";

/**
 * The minor the OpenShift GA probe starts from. Only a floor, not a pin: the
 * probe walks stable channels upward from here, so it merely needs to stay at
 * or below the oldest minor the catalog could ever resolve.
 */
const OPENSHIFT_PROBE_FLOOR = 20;

/**
 * Resolves the version a source should be built at: the explicit pin when
 * set, otherwise the latest GA OpenShift release from the Cincinnati upgrade
 * graph for extract: openshift, otherwise the latest GitHub release of the
 * source repo.
 *
 * A pin and the OpenShift release are normalized to a 'v' prefix (vX.Y.Z;
 * OpenShift: vX.Y). A resolved GitHub tag is returned verbatim: for crd
 * sources it doubles as the git ref for the asset/tree/kustomize fetch, so a
 * bare tag (e.g. strimzi's `1.1.0`) must not be rewritten to `v1.1.0`.
 */
export async function resolveVersion(source: Source): Promise<string> {
  if (source.version !== undefined) {
    return normalizeVersion(source.version);
  }
  if (source.extract === "openshift") {
    return `v${await latestOpenShiftGA()}`;
  }
  const repo = repoOf(source);
  const releaseTag = source.extract === "crd" ? source.input.releaseTag : undefined;
  if (releaseTag !== undefined) {
    return pickLatestRelease(await listReleases(repo), releaseTag);
  }
  return await latestReleaseTag(repo);
}

/**
 * Picks the highest-semver release tag matching a glob, skipping drafts and
 * prereleases. Used when a repo interleaves unrelated release tags that
 * /releases/latest can surface — an unrelated line (external-secrets'
 * `helm-chart-*` alongside `v*`) or, in a monorepo, other components
 * (kubernetes/autoscaler ships `vertical-pod-autoscaler-<ver>` next to
 * `cluster-autoscaler-*` and `vertical-pod-autoscaler-chart-<ver>`).
 *
 * The glob's wildcard must expand to a version: the character right after the
 * literal prefix has to be a digit, which rejects sibling tags whose wildcard
 * would instead start with another word (`…-chart-0.10.0`). Tags are ordered
 * by the semver embedded in the tag, so a name prefix (`vertical-pod-autoscaler-`)
 * doesn't defeat sorting. Highest semver, not most-recent, so a backported
 * patch of an older line never wins.
 */
export function pickLatestRelease(releases: Release[], pattern: string): string {
  const prefix = pattern.includes("*") ? pattern.slice(0, pattern.indexOf("*")) : pattern;
  const tags = releases
    .filter((r) => !r.draft && !r.prerelease && matchAsset(pattern, r.tag_name))
    .filter((r) => /^\d/.test(r.tag_name.slice(prefix.length)))
    .map((r) => r.tag_name);
  if (tags.length === 0) {
    throw new Error(`no release tag matches '${pattern}'`);
  }
  tags.sort((a, b) => Bun.semver.order(semverOf(a), semverOf(b)));
  return tags.at(-1)!;
}

/** The semver embedded in a release tag (`vertical-pod-autoscaler-1.7.0` → `1.7.0`). */
export function semverOf(tag: string): string {
  return tag.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)?.[0] ?? tag;
}

/**
 * The human-facing version for the README table, field-index headers and web
 * index: the resolved tag with any project-name prefix stripped, keeping the
 * leading `v` only when the upstream tag has one (`operator/v0.10.2` → `v0.10.2`,
 * `opensearch-operator-3.0.2` → `3.0.2`, `knative-v1.22.2` → `v1.22.2`). The
 * full tag stays the source of record in the history manifest because it
 * doubles as the git ref for extraction — this is a pure display derivation.
 * A tag with no dotted version (never a resolved version in practice) falls
 * back to itself unchanged.
 */
export function displayVersion(version: string): string {
  return version.match(/v?\d+\.\d+.*/)?.[0] ?? version;
}

export function normalizeVersion(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

/**
 * The highest GA OpenShift X.Y release per the Cincinnati upgrade graph (the
 * data OpenShift clusters themselves upgrade from): stable channels are
 * probed upward from the floor, and a minor is GA once its stable channel
 * contains a release of that minor. Pre-GA and unknown channels answer 200
 * with an empty node list, which ends the walk.
 */
async function latestOpenShiftGA(): Promise<string> {
  let latest: string | null = null;
  for (let minor = OPENSHIFT_PROBE_FLOOR; ; minor++) {
    const url = `${CINCINNATI_URL}?channel=stable-4.${minor}`;
    const res = await fetchRetry(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
    }
    if (!hasStableRelease(await res.json(), `4.${minor}`)) {
      break;
    }
    latest = `4.${minor}`;
  }
  if (latest === null) {
    throw new Error(
      `could not resolve the latest OpenShift release: stable-4.${OPENSHIFT_PROBE_FLOOR} has no GA release`,
    );
  }
  return latest;
}

/**
 * Whether a Cincinnati graph document carries a release of the given X.Y
 * minor. Stable channels also list previous-minor releases as upgrade
 * sources, so the node versions must be matched against the minor itself.
 */
export function hasStableRelease(doc: unknown, minor: string): boolean {
  const nodes = (doc as { nodes?: unknown[] }).nodes ?? [];
  return nodes.some((node) => {
    const version = (node as Record<string, unknown>).version;
    return typeof version === "string" && version.startsWith(`${minor}.`);
  });
}

/**
 * The git ref a source's extraction reads at a resolved version: the
 * release branch for OpenShift, the tag verbatim for everything else
 * (crd inputs fetch trees/assets at the tag; k8s swagger tags carry the
 * normalized `v` prefix). This is the ref whose commit SHA the history
 * manifest records.
 */
export function sourceRef(source: Source, version: string): string {
  return source.extract === "openshift" ? openshiftRef(version) : version;
}

/**
 * The openshift/api branch for a resolved OpenShift version (v4.20 →
 * release-4.20); a version pinned to a branch name passes through as-is.
 */
export function openshiftRef(version: string): string {
  const bare = version.replace(/^v/, "");
  return bare.startsWith("release-") ? bare : `release-${bare}`;
}

/** The bare Kubernetes version for `extract k8s --version` (v1.36.2 → 1.36.2). */
export function bareVersion(version: string): string {
  return version.replace(/^v/, "");
}
