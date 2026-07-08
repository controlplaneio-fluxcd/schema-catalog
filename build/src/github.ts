// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import { runBoundedPool } from "./pool.ts";

const API_BASE = "https://api.github.com";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "schema-catalog-build",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

// Sized for API calls, release-asset downloads and single-file raw downloads.
const FETCH_TIMEOUT_MS = 60_000;
const RETRIES = 2;

/**
 * fetch with a timeout, and retries with backoff on 429, 5xx, network errors
 * and 403 secondary rate limits (GitHub signals those with a Retry-After
 * header). An exhausted API rate limit is reported as such instead of a
 * bare 403 (unauthenticated CI runs sit at 60 requests/hour).
 */
export async function fetchRetry(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      if (attempt >= RETRIES) {
        throw err;
      }
      await Bun.sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error(`GET ${url}: GitHub API rate limit exceeded; set GITHUB_TOKEN to raise it`);
    }
    const after = Number(res.headers.get("retry-after"));
    const secondaryLimit = res.status === 403 && after > 0;
    if ((res.status === 429 || res.status >= 500 || secondaryLimit) && attempt < RETRIES) {
      await Bun.sleep(after > 0 ? after * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

async function apiJson(path: string): Promise<unknown> {
  const res = await fetchRetry(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Returns the tag name of the latest GitHub release of owner/name. */
export async function latestReleaseTag(repo: string): Promise<string> {
  const release = await apiJson(`/repos/${repo}/releases/latest`);
  const tag = (release as { tag_name?: unknown }).tag_name;
  if (typeof tag !== "string" || tag === "") {
    throw new Error(`no tag_name in latest release of ${repo}`);
  }
  return tag;
}

/**
 * Returns the most recent page of releases of owner/name (up to 100), for
 * callers that pick a tag themselves rather than trust /releases/latest.
 */
export async function listReleases(repo: string): Promise<Release[]> {
  const releases = await apiJson(`/repos/${repo}/releases?per_page=100`);
  if (!Array.isArray(releases)) {
    throw new Error(`unexpected releases payload for ${repo}`);
  }
  return releases as Release[];
}

/**
 * Returns the commit SHA a git ref points at. The commits endpoint
 * dereferences annotated tags to the tagged commit, so the result is always
 * a commit SHA — the value that pins a build even if the tag later moves.
 */
export async function commitSha(repo: string, ref: string): Promise<string> {
  const commit = await apiJson(`/repos/${repo}/commits/${encodeURIComponent(ref)}`);
  const sha = (commit as { sha?: unknown }).sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`no commit sha for ${repo}@${ref}`);
  }
  return sha;
}

/**
 * Returns the release asset matching the name pattern (supports '*' wildcards)
 * for the given release tag.
 */
export async function findReleaseAsset(
  repo: string,
  tag: string,
  pattern: string,
): Promise<ReleaseAsset> {
  const release = await apiJson(`/repos/${repo}/releases/tags/${tag}`);
  const assets = (release as { assets?: ReleaseAsset[] }).assets ?? [];
  const matches = assets.filter((a) => matchAsset(pattern, a.name));
  if (matches.length === 0) {
    const names = assets.map((a) => a.name).join(", ") || "none";
    throw new Error(`${repo}@${tag}: no release asset matches '${pattern}' (assets: ${names})`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${repo}@${tag}: multiple release assets match '${pattern}': ${matches.map((a) => a.name).join(", ")}`,
    );
  }
  return matches[0]!;
}

export async function downloadAsset(asset: ReleaseAsset): Promise<string> {
  return downloadText(asset.browser_download_url);
}

async function downloadText(url: string): Promise<string> {
  const res = await fetchRetry(url, { headers: { "User-Agent": "schema-catalog-build" } });
  if (!res.ok) {
    throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

interface ContentEntry {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
}

/** Contents API path for a repo file or directory, with the path segments
 * and ref percent-encoded (refs like `operator/v0.10.2` are legal, but `#`,
 * `&`, `+` or spaces would otherwise corrupt the query). */
function contentsPath(repo: string, path: string, ref: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
}

async function listYamlFiles(
  repo: string,
  ref: string,
  dir: string,
): Promise<{ path: string; downloadUrl: string }[]> {
  const entries = await apiJson(contentsPath(repo, dir, ref));
  if (!Array.isArray(entries)) {
    throw new Error(`${repo}@${ref}: '${dir}' is not a directory`);
  }
  if (entries.length === 1000) {
    // The Contents API caps a directory listing at 1000 entries; one recursive
    // git tree listing covers the whole ref instead (the upjet providers ship
    // thousands of per-kind CRD files in package/crds).
    return listYamlFilesViaTree(repo, ref, dir);
  }

  const files: { path: string; downloadUrl: string }[] = [];
  for (const entry of entries as ContentEntry[]) {
    if (entry.type === "dir") {
      files.push(...(await listYamlFiles(repo, ref, entry.path)));
    } else if (entry.type === "file" && entry.name.endsWith(".yaml")) {
      if (entry.download_url === null) {
        throw new Error(`${repo}@${ref}: '${entry.path}' has no download_url`);
      }
      files.push({ path: entry.path, downloadUrl: entry.download_url });
    }
  }
  return files;
}

interface TreeEntry {
  path: string;
  type: string;
}

/** Raw file URL at a ref — what the Contents API's download_url points at. */
function rawUrl(repo: string, ref: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${encoded}`;
}

/** The `.yaml` blob paths under `dir` from a recursive git tree listing. */
export function yamlFilesInTree(entries: TreeEntry[], dir: string): string[] {
  const prefix = `${dir}/`;
  return entries
    .filter((e) => e.type === "blob" && e.path.startsWith(prefix) && e.path.endsWith(".yaml"))
    .map((e) => e.path);
}

/**
 * Lists `*.yaml` files under a repo directory from one recursive git tree
 * listing — the over-1000-entries fallback for directories the Contents API
 * cannot list in full. The tree endpoint has its own truncation flag (~100k
 * entries), which stays a hard error: a silently partial CRD set must never
 * reach extraction.
 */
async function listYamlFilesViaTree(
  repo: string,
  ref: string,
  dir: string,
): Promise<{ path: string; downloadUrl: string }[]> {
  const tree = await apiJson(`/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if ((tree as { truncated?: boolean }).truncated === true) {
    throw new Error(`${repo}@${ref}: recursive git tree listing was truncated by the API`);
  }
  const entries = (tree as { tree?: TreeEntry[] }).tree;
  if (!Array.isArray(entries)) {
    throw new Error(`${repo}@${ref}: unexpected git tree payload`);
  }
  return yamlFilesInTree(entries, dir).map((path) => ({ path, downloadUrl: rawUrl(repo, ref, path) }));
}

/**
 * Recursively fetches every `*.yaml` file under a repo directory at a git ref
 * via the GitHub Contents API, with one listing call per directory and raw
 * per-file downloads instead of a repo tarball, then concatenates them into
 * one multi-document stream (sorted by path for a deterministic order). For
 * repos that ship CRDs as bare per-kind files with no release asset or
 * kustomization (e.g. cilium's client/crds tree).
 *
 * `exclude` drops files whose basename matches any of the given globs (`*`
 * spans any characters) — for a dir that co-locates a CRD another source
 * already owns (e.g. calico's crd dir vendors a network-policy-api CRD). A
 * glob matching nothing is a hard error, so a stale exclude never silently
 * stops filtering.
 */
export async function fetchCrdDir(
  repo: string,
  ref: string,
  dir: string,
  exclude: string[] = [],
): Promise<string> {
  const all = await listYamlFiles(repo, ref, dir);
  const files = excludeByBasename(all, exclude, `${repo}@${ref} under '${dir}'`);
  if (files.length === 0) {
    throw new Error(`${repo}@${ref}: no .yaml files under '${dir}'`);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const downloads = await runBoundedPool(files, 8, (f) => downloadText(f.downloadUrl));
  return downloads
    .map((result) => {
      if ("error" in result) {
        throw result.error;
      }
      return result.value;
    })
    .join("\n---\n");
}

/**
 * Drops files whose basename matches any of the `exclude` globs (`*` spans any
 * characters). A glob that matches nothing throws, so a stale exclude never
 * silently stops filtering (e.g. after upstream renames the vendored file).
 */
export function excludeByBasename<T extends { path: string }>(
  files: T[],
  exclude: string[],
  label: string,
): T[] {
  let kept = files;
  for (const glob of exclude) {
    const next = kept.filter((f) => !matchAsset(glob, f.path.slice(f.path.lastIndexOf("/") + 1)));
    if (next.length === kept.length) {
      throw new Error(`${label}: exclude '${glob}' matched no file`);
    }
    kept = next;
  }
  return kept;
}

/**
 * Fetches a single YAML file from a repo tree at a git ref. For repos that
 * commit their whole CRD set as one bundled file with no release asset and no
 * isolated directory (e.g. rook's deploy/examples/crds.yaml, which shares a
 * directory with ~99 unrelated example manifests).
 */
export async function fetchCrdFile(repo: string, ref: string, path: string): Promise<string> {
  const entry = await apiJson(contentsPath(repo, path, ref));
  if (Array.isArray(entry) || !(entry as ContentEntry).download_url) {
    throw new Error(`${repo}@${ref}: '${path}' is not a file`);
  }
  return downloadText((entry as ContentEntry).download_url!);
}

/** Matches an asset name against a pattern where '*' spans any characters. */
export function matchAsset(pattern: string, name: string): boolean {
  const re = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}$`).test(name);
}
