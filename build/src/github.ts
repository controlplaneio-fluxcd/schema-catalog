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

const FETCH_TIMEOUT_MS = 60_000;
const RETRIES = 2;

/**
 * fetch with a timeout, and retries with backoff on 429, 5xx and network
 * errors. An exhausted API rate limit is reported as such instead of a
 * bare 403 (unauthenticated CI runs sit at 60 requests/hour).
 */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
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
    if ((res.status === 429 || res.status >= 500) && attempt < RETRIES) {
      const after = Number(res.headers.get("retry-after"));
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

/**
 * Recursively fetches every `*.yaml` file under a repo directory at a git ref
 * and concatenates them into one multi-document stream (sorted by path for a
 * deterministic order). For repos that ship CRDs as bare per-kind files with
 * no release asset or kustomization (e.g. cilium's client/crds tree).
 */
export async function fetchCrdDir(repo: string, ref: string, dir: string): Promise<string> {
  const files = await listYamlFiles(repo, ref, dir);
  if (files.length === 0) {
    throw new Error(`${repo}@${ref}: no .yaml files under '${dir}'`);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const docs = await Promise.all(files.map((f) => downloadText(f.download_url!)));
  return docs.join("\n---\n");
}

async function listYamlFiles(repo: string, ref: string, dir: string): Promise<ContentEntry[]> {
  const listing = await apiJson(`/repos/${repo}/contents/${dir}?ref=${ref}`);
  if (!Array.isArray(listing)) {
    throw new Error(`${repo}@${ref}: '${dir}' is not a directory`);
  }
  const entries = listing as ContentEntry[];
  const files: ContentEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "dir") {
      files.push(...(await listYamlFiles(repo, ref, entry.path)));
    } else if (entry.type === "file" && entry.name.endsWith(".yaml") && entry.download_url) {
      files.push(entry);
    }
  }
  return files;
}

/** Matches an asset name against a pattern where '*' spans any characters. */
export function matchAsset(pattern: string, name: string): boolean {
  const re = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${re}$`).test(name);
}
