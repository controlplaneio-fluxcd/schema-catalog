// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { latestReleaseTag, listReleases, matchAsset, type Release } from "./github.ts";
import { repoOf } from "./config.ts";
import type { Source } from "./types.ts";

const ENDOFLIFE_URL = "https://endoflife.date/api/v1/products/red-hat-openshift/";

/**
 * Resolves the version a source should be built at: the explicit pin when
 * set, otherwise the latest OpenShift release from endoflife.date for
 * extract: openshift, otherwise the latest GitHub release of the source repo.
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
    const res = await fetch(ENDOFLIFE_URL);
    if (!res.ok) {
      throw new Error(`GET ${ENDOFLIFE_URL}: ${res.status} ${res.statusText}`);
    }
    return `v${pickLatestOpenShift(await res.json())}`;
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
 * Picks the highest non-EOL X.Y release from an endoflife.date product
 * document; does not rely on the API's ordering.
 */
export function pickLatestOpenShift(doc: unknown): string {
  const releases = (doc as { result?: { releases?: unknown[] } }).result?.releases ?? [];
  const versions = releases
    .filter((r): r is { name: string; isEol: boolean } => {
      const rec = r as Record<string, unknown>;
      return typeof rec.name === "string" && rec.isEol === false;
    })
    .map((r) => r.name.match(/^(\d+)\.(\d+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ major: Number(m[1]), minor: Number(m[2]) }));
  if (versions.length === 0) {
    throw new Error("could not resolve the latest OpenShift release from endoflife.date");
  }
  versions.sort((a, b) => a.major - b.major || a.minor - b.minor);
  const latest = versions.at(-1)!;
  return `${latest.major}.${latest.minor}`;
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
