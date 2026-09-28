// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

/**
 * Copies the latest catalog into Workers Assets for deployment. Local dev
 * serves the repo's catalog tree directly and skips this copy.
 */
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const catalogDir = join(import.meta.dir, "..", "..", "catalog");
const destination = join(import.meta.dir, "..", "dist", "assets", "catalog");

await rm(destination, { recursive: true, force: true });
await cp(catalogDir, destination, { recursive: true });
console.log(`catalog copied to ${destination}`);
