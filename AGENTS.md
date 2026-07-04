# Agent guide

This repository hosts a catalog of JSON Schemas and field indexes for
Kubernetes, OpenShift, the Flux ecosystem and other CNCF projects. The
schemas power `flux-schema validate`; the `.fields.txt` indexes are an
offline `kubectl explain` replacement for AI agents (one greppable line per
field: dotted path, type, constraints, description).

For build system internals — dataflow, module map, extraction model, history
manifest invariants — read [build/src/README.md](build/src/README.md) before
touching anything under `build/src/`.

## Layout

| Path                    | What it is                                                       |
| ----------------------- | ---------------------------------------------------------------- |
| `catalog/<group>/`      | **Generated.** `<kind>_<version>.json` + `.fields.txt` siblings  |
| `build/sources.yaml`    | Catalog sources config — the only file to edit to add a project  |
| `build/history/*.json`  | **Generated.** Per-source provenance manifests                   |
| `build/src/`            | The Bun build system ([internals](build/src/README.md))          |
| `README.md`             | Versions table between markers is **generated**                  |
| `.github/workflows/`    | `test.yaml` (lint+test), `update-catalog.yaml` (daily build+PR)  |
| `plans/`                | Git-ignored local scratch — never reference it in committed files |

## Rules

- **Never hand-edit generated files**: everything under `catalog/`,
  `build/history/`, and the README versions table is owned by the build.
  Change them by running `make build` (or let CI do it).
- **Bun-native only**: no npm runtime dependencies (`@types/bun` is the only
  dev dependency), no eslint/prettier. Reach for `Bun.YAML`, `Bun.semver`,
  `Bun.$`, `bun test` and node builtins.
- **Adding a catalog source is config-only**: edit `build/sources.yaml`,
  nothing else — no code, no test changes. See the
  [recipe](build/src/README.md#adding-a-source).
- **flux-schema binary**: resolved from `FLUX_SCHEMA_BIN` (a single binary
  path), else PATH. Locally, Bun auto-loads the git-ignored `build/.env`;
  CI installs a released CLI via `fluxcd/flux-schema/actions/setup`.
- **GitHub Actions are pinned to commit SHAs** (with a `# vX.Y.Z` comment).
  When bumping a pin, dereference annotated tags to the underlying commit —
  the tag object SHA will not resolve.
- **Commits**: signed off (`git commit -s`), compact and logically split;
  when a change spans code and generated catalog files, commit the catalog
  changes last and separately.

## Commands

```shell
make deps    # bun install (needed before lint)
make lint    # tsc --noEmit against build/tsconfig.json
make test    # bun test — pure logic only, needs no Flux CLIs or network
make build   # full catalog build; FORCE_BUILD=1 and BUILD_SUMMARY=<path> opt in
```

Direct CLI (from `build/`): `bun src/main.ts build [--source <name>]
[--force] [--summary <path>]` and `bun src/main.ts regen [--source <name>]`.

## Verification

- Pure-logic changes: `make lint test`.
- Extractor/resolver/sync changes: additionally run a real single-source
  build (`bun src/main.ts build --source flagger --force` is the fastest),
  confirm the second run reports "up to date", and restore any churned
  `build/history` timestamps before committing
  (`git checkout -- build/history`).
- Catalog-wide claims (e.g. "validation still works"): run `flux-schema
  validate <manifests> --schema-location ./catalog` against a real example.

## CI

`test.yaml` runs lint+test on PRs and main, path-filtered to the build
system. `update-catalog.yaml` runs daily and on dispatch (optional force
input): it builds the catalog, and only when the build signals
`changed=true` it smoke-tests the result by validating
`fluxcd/flux2-kustomize-helm-example` against the local catalog, then opens
a PR whose body is the build's own `--summary` output (only changed sources,
never the full list).
