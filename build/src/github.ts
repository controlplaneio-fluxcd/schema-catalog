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

async function fetchTarball(repo: string, ref: string): Promise<Uint8Array> {
  const url = `${API_BASE}/repos/${repo}/tarball/${ref}`;
  const res = await fetchRetry(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`GET ${url}: ${res.status} ${res.statusText}`);
  }
  return new Uint8Array(await res.arrayBuffer());
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
  const files = extractTarFiles(await fetchTarball(repo, ref), dir);
  if (files.length === 0) {
    throw new Error(`${repo}@${ref}: no .yaml files under '${dir}'`);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files.map((f) => f.text).join("\n---\n");
}

export function extractTarFiles(gz: Uint8Array, dir: string): { path: string; text: string }[] {
  const tar = Bun.gunzipSync(arrayBufferBytes(gz));
  const files: { path: string; text: string }[] = [];
  const decoder = new TextDecoder();
  const wantedPrefix = `${dir}/`;
  let offset = 0;
  let zeroBlocks = 0;
  let topLevel: string | null = null;

  while (offset < tar.length) {
    if (offset + 512 > tar.length) {
      throw new Error("truncated tar archive");
    }
    const header = tar.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      zeroBlocks++;
      offset += 512;
      if (zeroBlocks === 2) {
        return files;
      }
      continue;
    }
    zeroBlocks = 0;

    const name = tarString(header, 0, 100);
    const typeflag = header[156]!;
    const prefix = tarString(header, 345, 500);
    const path = prefix ? `${prefix}/${name}` : name;
    const size = tarSize(header);
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    const nextOffset = bodyStart + Math.ceil(size / 512) * 512;
    if (bodyEnd > tar.length || nextOffset > tar.length) {
      throw new Error("truncated tar archive");
    }

    if (typeflag === 0x67) {
      offset = nextOffset;
      continue;
    }
    if (typeflag === 0x78) {
      if (paxHasPath(decoder.decode(arrayBufferBytes(tar.subarray(bodyStart, bodyEnd))))) {
        throw new Error("unsupported tar long-name entry (pax/GNU); ustar-only parser");
      }
      offset = nextOffset;
      continue;
    }
    if (typeflag === 0x4c) {
      throw new Error("unsupported tar long-name entry (pax/GNU); ustar-only parser");
    }
    if (topLevel === null) {
      const slash = path.indexOf("/");
      if (slash < 0) {
        throw new Error("tar archive missing top-level directory");
      }
      topLevel = path.slice(0, slash);
    }
    if (typeflag !== 0x30 && typeflag !== 0x00) {
      offset = nextOffset;
      continue;
    }

    const repoRelativePath = path.startsWith(`${topLevel}/`) ? path.slice(topLevel.length + 1) : path;
    if (repoRelativePath.startsWith(wantedPrefix) && repoRelativePath.endsWith(".yaml")) {
      files.push({
        path: repoRelativePath,
        text: decoder.decode(arrayBufferBytes(tar.subarray(bodyStart, bodyEnd))),
      });
    }
    offset = nextOffset;
  }

  throw new Error("truncated tar archive");
}

/**
 * Fetches a single YAML file from a repo tree at a git ref. For repos that
 * commit their whole CRD set as one bundled file with no release asset and no
 * isolated directory (e.g. rook's deploy/examples/crds.yaml, which shares a
 * directory with ~99 unrelated example manifests).
 */
export async function fetchCrdFile(repo: string, ref: string, path: string): Promise<string> {
  const entry = await apiJson(`/repos/${repo}/contents/${path}?ref=${ref}`);
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

function isZeroBlock(block: Uint8Array): boolean {
  return block.every((byte) => byte === 0);
}

function tarString(block: Uint8Array, start: number, end: number): string {
  let stop = start;
  while (stop < end && block[stop] !== 0) {
    stop++;
  }
  return new TextDecoder().decode(block.subarray(start, stop));
}

function tarSize(header: Uint8Array): number {
  if ((header[124]! & 0x80) !== 0) {
    throw new Error("unsupported base-256 tar size");
  }
  const raw = Array.from(header.subarray(124, 136))
    .filter((byte) => byte !== 0 && byte !== 0x20)
    .map((byte) => String.fromCharCode(byte))
    .join("");
  if (raw === "") {
    return 0;
  }
  if (!/^[0-7]+$/.test(raw)) {
    throw new Error("invalid tar size");
  }
  return Number.parseInt(raw, 8);
}

function paxHasPath(body: string): boolean {
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(" ", offset);
    if (space < 0) {
      throw new Error("invalid pax header");
    }
    const length = Number.parseInt(body.slice(offset, space), 10);
    if (!Number.isFinite(length) || length <= 0 || offset + length > body.length) {
      throw new Error("invalid pax header");
    }
    if (body.slice(space + 1, offset + length).startsWith("path=")) {
      return true;
    }
    offset += length;
  }
  return false;
}

function arrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}
