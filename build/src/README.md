# Build system internals

Bun/TypeScript build system that populates `catalog/` with JSON Schemas and
`.fields.txt` field indexes extracted from Kubernetes API sources via the
[flux-schema](https://github.com/fluxcd/flux-schema) CLI. This document is the
reference for how the pieces fit together; read it before changing anything
under `build/src/`.

## Constraints

- **Bun-native only.** No npm runtime dependencies; the sole dev dependency is
  `@types/bun`. Use `Bun.YAML`, `Bun.semver`, `Bun.$`, `Bun.file`/`Bun.write`
  and `bun test` instead of packages (no yaml/zod/commander/eslint). Node
  builtins (`node:fs`, `node:path`, `node:util`) are fine.
- **Data-driven.** Adding a project to the catalog must be a config-only edit
  to `build/config/sources.yaml` — never a code or test change. The one deliberate
  exception is Flux itself (see `fluxInstance` below).
- **The CLI is the contract.** All schema extraction shells out to the
  `flux-schema` binary (a single executable path from `FLUX_SCHEMA_BIN`, else
  `flux-schema` on PATH). Locally, Bun auto-loads `build/.env` (git-ignored)
  which points at a dev binary; CI installs a released binary via
  `fluxcd/flux-schema/actions/setup`.

## Dataflow

One `build` run per source:

```
sources.yaml ──parse/validate──▶ Source
                                   │ resolveVersion()        (skip if version
                                   ▼                          unchanged AND all
                             extractSource() ──▶ temp staging dir   files exist)
                                   │
                     guards: non-empty output,
                     no cross-source file conflicts
                                   ▼
                     syncCatalog() copy into catalog/
                                   ▼
                     gcCatalog(removedFiles())  — delete files dropped
                                   ▼              since the last manifest
                     writeHistory()             — atomic, written LAST
```

After all sources: orphan GC (full builds only), README versions table
regenerated from the manifests, optional `--summary` markdown, and a
`changed=true|false` line appended to `$GITHUB_OUTPUT` for CI.

## Module map

| File          | Responsibility                                                                |
| ------------- | ----------------------------------------------------------------------------- |
| `main.ts`     | CLI (`build`/`regen`), per-source orchestration, failure isolation, CI signal |
| `types.ts`    | `Source` discriminated union, `CrdInput`, `HistoryEntry` — the config contract |
| `config.ts`   | sources.yaml parsing with strict validation (unknown keys rejected)           |
| `resolve.ts`  | version resolution + normalization (`v` prefix, OpenShift refs, bare k8s)     |
| `github.ts`   | GitHub REST via fetch: latest release, asset lookup/download, retry/timeout   |
| `extract.ts`  | runs flux-schema/kubectl/flux-operator via `Bun.$` into the staging dir       |
| `history.ts`  | provenance manifests, staging listing, catalog sync, GC                       |
| `readme.ts`   | versions table between `<!-- versions:start/end -->` markers in README.md     |
| `summary.ts`  | markdown PR body: only changed sources, orphan removals, up-to-date count     |
| `paths.ts`    | repo-root-derived paths and `FLUX_SCHEMA_BIN`                                 |

## Extraction model

`extract` in sources.yaml maps 1:1 to `flux-schema extract` subcommands:

- `k8s` / `openshift` — self-contained; the CLI fetches the OpenAPI swagger
  itself (`--version 1.36.2` bare, `--ref release-4.20`).
- `crd` — needs an `input` declaring where the CRD YAML comes from, exactly one
  of: `kustomize` (build `<url>/<path>?ref=<version>` with kubectl),
  `releaseAsset` (download a GitHub release asset by name or `*` glob), `crdDir`
  (recursively fetch every `*.yaml` under a repo directory at the ref and
  concatenate them — for repos that ship bare per-kind CRD files with no asset
  or kustomization, e.g. cilium), `crdFile` (fetch a single committed file at
  the ref — for repos that bundle their whole CRD set into one file that shares
  a directory with unrelated manifests, so `crdDir` would over-collect, e.g.
  rook's `deploy/examples/crds.yaml`), or
  `fluxInstance` (the Flux special case: the manifest is constructed as a typed
  object with the resolved version in `spec.distribution.version` and piped
  through `flux-operator build instance -f -`). An `input` may also carry an
  optional `releaseTag` glob (e.g. `v*`) that constrains version resolution to
  the highest matching release tag — for repos that interleave unrelated tags
  (external-secrets ships `helm-chart-*` releases alongside the app `v*` ones)
  that GitHub's `/releases/latest` would otherwise surface.

Every extraction runs with `--strip-description=false --with-field-index
--index-source="<alias> <version> <url>"` and the
`{{ .Group }}/{{ .Kind }}_{{ .Version }}.json` output template. The binary
lowercases all template variables, so catalog filenames are lowercase.

Before piping, the assembled CRD stream is normalized to drop a leading
comment/blank banner terminated by `---` (`dropLeadingCommentDoc`): that
preamble parses as an empty first YAML document, which flux-schema rejects with
"document is not a YAML mapping". Several bundles ship one as a license or usage
header (e.g. rook's `crds.yaml`).

**Pipeline stages are separate `$` calls on purpose.** A Bun-shell pipeline,
like bash without pipefail, reports only the last command's exit code — a
failing `kubectl kustomize | flux-schema` once passed silently with zero
output. Producers run alone via `.text()`, then the YAML is fed to
`flux-schema extract crd /dev/stdin` with `< ${new Response(yaml)}`.

## History manifests — the source of truth

`build/history/<name>.json` records repo, resolved version, build timestamp,
flux-schema version, and the sorted list of repo-root-relative catalog files
the source owns. Everything derives from these manifests:

- **Skip detection**: resolved version == manifest version AND every listed
  file exists on disk (the existence check makes a partially-synced catalog
  self-heal). `--force` bypasses.
- **GC**: files in the previous manifest missing from the new build are
  deleted — but never files currently owned by another source's manifest
  (`removedFiles`'s `foreign` set). Sync likewise refuses to overwrite a
  foreign-owned path; a collision fails that source.
- **Orphan GC**: on full (unfiltered) builds, a manifest whose name is no
  longer in sources.yaml gets its files deleted and the manifest removed.
- **Regen**: `regen` rebuilds at the manifest's pinned version (reproduces the
  catalog without version resolution).
- **README + PR body**: both rendered from manifests, never hand-edited.

Write ordering is sync → GC → history (atomic tmp+rename, written last), so a
crash leaves the manifest describing the *previous* consistent state and the
next run converges. A corrupt manifest is dropped with a warning and the
source rebuilds from scratch. Failures are per-source: one source failing
never blocks the others; the run exits 1 at the end.

## CLI

```shell
cd build
bun src/main.ts build [--source <name>] [--force] [--summary <path>]
bun src/main.ts regen [--source <name>]
# or from the repo root: make deps / lint / test / build
# make build honors FORCE_BUILD=1 and BUILD_SUMMARY=<path> env/vars
```

Env: `FLUX_SCHEMA_BIN` (single binary path, not a command line),
`GITHUB_TOKEN` (raises API rate limits; github.ts retries 429/5xx with
backoff and reports an exhausted limit explicitly), `GITHUB_OUTPUT` (when set,
the build appends `changed=true|false`; the update workflow gates the
Create PR and smoke-test steps on it).

## Testing boundaries

`bun test` covers only pure logic: config validation, version helpers, the
endoflife.date picker, GC diffing, renderers, asset-glob matching, and the
FluxInstance manifest shape. Nothing in the suite shells out or touches the
network — the tests run with no Flux CLIs installed (that is what allows
`test.yaml` in CI to need only Bun). Extraction correctness is verified by the
build's own guards and by the update workflow's smoke test, which validates
`fluxcd/flux2-kustomize-helm-example` against the freshly built catalog before
opening a PR. Keep it that way: new pure logic gets unit tests; new side
effects get guards or a CI check, not mocks.

## Adding a source

Add an entry to `build/config/sources.yaml` (see `types.ts` for the shape and
`config.ts` for what the validator enforces) and run `make build`. Pick the
`input` by how the project ships its CRDs:

- **`releaseAsset`** — a CRD bundle attached to a GitHub release (preferred).
  Add `releaseTag: "<glob>"` when the repo interleaves unrelated release tags
  so version resolution ignores them (e.g. external-secrets' `helm-chart-*`
  releases alongside the app `v*` ones).
- **`kustomize`** — a kustomize overlay in the repo (`config/crd` and friends).
- **`crdDir`** — bare per-kind CRD YAML files under a repo directory, with no
  release asset or kustomization (e.g. cilium's `client/crds` tree).
- **`crdFile`** — a single committed file bundling the whole CRD set, sharing a
  directory with unrelated manifests so `crdDir` would over-collect (e.g. rook's
  `deploy/examples/crds.yaml`).

Repos that maintain two concurrent release lines need `releaseTag` to pin the
one you want (strimzi ships a `0.x` line that still serves `v1beta2` and a `1.x`
line that serves `v1` only; the pin keeps `/releases/latest` from flipping
between them). A resolved tag is used verbatim as the git ref, so bare tags
(strimzi's `0.51.0`, no `v`) are supported and appear un-prefixed in the table.

No code or test edits. If validation of a popular example repo starts failing
on a missing schema, that is the signal to add the project here.

**A green build does not mean the schemas are correct.** The build's guards
only check that extraction produced files and that no two sources collide —
nothing verifies the *shape* of what came out. The extraction transforms
(`$ref` inlining, int-or-string rewriting, nullable widening,
additionalProperties closing) can silently mangle a schema, and the damage
only surfaces when a *realistic* custom resource is validated against it. So
before committing a new source, validate at least one complex, representative
manifest for it against the freshly built catalog:

```shell
flux-schema validate <real-manifest.yaml> --schema-location ./catalog
```

Choose a resource that exercises the hard parts — union specs (`oneOf`/`anyOf`),
deeply nested objects, int-or-string fields, preserve-unknown-fields maps — not
a minimal stub. Confirm both directions: a *valid* manifest must pass (a false
rejection means the extracted schema is over-strict), and an intentionally
broken one must fail (a false accept means it is too loose). Adding Cilium is
the cautionary tale — the build was green and the schemas looked plausible, but
every valid `CiliumNetworkPolicy` was rejected because `additionalProperties:
false` had been injected into the spec's `oneOf` branches, a flux-schema bug
(fixed in 0.7.1) that only a real-resource validation would have caught.
