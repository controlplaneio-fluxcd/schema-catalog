import type { CatalogIndex } from "../shared/types.ts";
import type { Env } from "./index.ts";

/**
 * In-isolate memoized index state. `CATALOG_VERSION` is part of the memoization
 * key so a new deploy reloads `index.json` even if the previous isolate survives
 * briefly at the edge.
 */
let cachedVersion: string | undefined;
let cachedIndex: CatalogIndex | undefined;

/**
 * Loads the generated `index.json` asset and memoizes it for the active
 * `CATALOG_VERSION`. Missing assets throw because the Worker cannot serve UI or
 * MCP discovery without an index.
 */
export async function loadIndex(env: Env): Promise<CatalogIndex> {
  if (cachedVersion === env.CATALOG_VERSION && cachedIndex !== undefined) {
    return cachedIndex;
  }

  const resp = await env.ASSETS.fetch(new Request("https://assets.local/index.json"));
  if (!resp.ok) {
    throw new Error(`catalog index asset is missing: index.json returned ${resp.status}`);
  }

  const text = await resp.text();
  const index = JSON.parse(text) as CatalogIndex;
  cachedVersion = env.CATALOG_VERSION;
  cachedIndex = index;
  return index;
}
