import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, derived from this file's location (build/src/paths.ts). */
export const ROOT_DIR = fileURLToPath(new URL("../../", import.meta.url));

export const CATALOG_DIR = join(ROOT_DIR, "catalog");
export const HISTORY_DIR = join(ROOT_DIR, "build/history");
export const README_PATH = join(ROOT_DIR, "README.md");
export const SOURCES_PATH = join(ROOT_DIR, "build/sources.yaml");

/**
 * Path to the flux-schema executable (a single binary path, not a command
 * line); override with FLUX_SCHEMA_BIN for dev builds.
 */
export const FLUX_SCHEMA_BIN = process.env.FLUX_SCHEMA_BIN ?? "flux-schema";
