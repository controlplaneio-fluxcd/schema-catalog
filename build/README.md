# Build system internals

Bun/TypeScript build system that populates `catalog/` with JSON Schemas and
`.fields.txt` field indexes extracted from Kubernetes API sources via the
[flux-schema](https://github.com/fluxcd/flux-schema) CLI.

## Constraints

- **Bun-native only.** No npm runtime dependencies; the sole dev dependency is
  `@types/bun`. Use `Bun.YAML`, `Bun.semver`, `Bun.$`, `Bun.file`/`Bun.write`
  and `bun test` instead of packages; node builtins are fine.
- **Data-driven.** Adding a project must be a config-only edit to
  `build/config/sources.yaml`, never a code or test change. The one deliberate
  exception is Flux itself (see `fluxInstance` below).
- **The CLI is the contract.** All schema extraction shells out to the
  `flux-schema` binary (a single executable path from `FLUX_SCHEMA_BIN`, else
  PATH). Locally, Bun auto-loads the git-ignored `build/.env`; CI installs a
  released binary via `fluxcd/flux-schema/actions/setup`.

## Dataflow

One `build` run per source:

```
sources.yaml ──parse/validate──▶ Source
                                   │ resolveVersion()        (skip if version
                                   │ commitSha(ref)           unchanged AND all
                                   ▼                          files exist)
                             extractSource() ──▶ temp staging dir
                                   │
                     guards: non-empty output, fieldless
                     kinds pruned, no cross-source conflicts
                                   ▼
                     syncCatalog() copy into catalog/
                                   ▼
                     gcCatalog(removedFiles())  — delete files dropped
                                   ▼              since the last manifest
                     digestFiles(synced tree) ──▶ filesDigest
                                   ▼
                     writeHistory()             — atomic, written LAST
```

After all sources: orphan GC (full builds only), README stats badges and
versions table regenerated from the manifests, optional `--summary` markdown,
and a `changed=true|false` line appended to `$GITHUB_OUTPUT` for CI.

## Module map

| File          | Responsibility                                                                |
| ------------- | ----------------------------------------------------------------------------- |
| `main.ts`     | CLI (`build`/`regen`), per-source orchestration, failure isolation, CI signal |
| `types.ts`    | `Source` discriminated union, `CrdInput`, `HistoryEntry` — the config contract |
| `config.ts`   | sources.yaml parsing (sources + project groups) with strict validation (unknown keys rejected) |
| `resolve.ts`  | version resolution + normalization (`v` prefix, OpenShift refs, bare k8s)     |
| `github.ts`   | GitHub REST via fetch: latest release, asset lookup/download, retry/timeout   |
| `extract.ts`  | runs flux-schema/kubectl/flux-operator via `Bun.$` into the staging dir       |
| `history.ts`  | provenance manifests, staging listing, catalog sync, GC                       |
| `readme.ts`   | stats badges (`stats:` markers) + versions table (`versions:` markers) in README.md |
| `summary.ts`  | markdown PR body: only changed sources, orphan removals, up-to-date count     |
| `paths.ts`    | repo-root-derived paths and `FLUX_SCHEMA_BIN`                                 |

## Extraction model

`extract` in sources.yaml maps 1:1 to `flux-schema extract` subcommands:

- `k8s` / `openshift` — self-contained; the CLI fetches the OpenAPI swagger
  itself (`--version 1.36.2` bare, `--ref release-4.20`).
- `crd` — needs an `input` declaring where the CRD YAML comes from, exactly
  one of the following. `flux-schema extract crd` keeps only
  `CustomResourceDefinition` documents (descending into `List` items) and
  discards everything else, so an input may point at a file or directory that
  also ships RBAC, a Deployment or other manifests — multus's `crdFile`
  targets its full install daemonset and only the bundled CRD survives. Prefer
  the input that fetches the least and clones nothing: a CRD-only
  `releaseAsset`, then `crdDir`/`crdFile`; reach for `kustomize` only as a last
  resort.
  - `releaseAsset` — download a GitHub release asset by name or `*` glob; best
    when the project publishes a CRD-only bundle.
  - `crdDir` — fetch every `*.yaml` under a repo directory at the ref, for
    repos that ship bare per-kind CRD files (cilium's `client/crds`). A
    directory listing 500+ entries falls back to downloading the source
    tarball once at the resolved commit SHA instead of hundreds of
    rate-limited raw fetches (the upjet providers' `package/crds`).
  - `crdFile` — fetch a single committed file that bundles the whole CRD set,
    for when its directory holds unrelated manifests that `crdDir` would
    over-collect (rook's `deploy/examples/crds.yaml`), or when the CRDs are
    embedded in a larger install manifest (multus's `deployments/`).
  - `kustomize` — build `<url>/<path>?ref=<version>` with kubectl. **Last
    resort:** kubectl clones the whole repo at the ref (slow, and it can hit
    kubectl's hard-coded 27s git timeout on large repos), so use it only when
    the CRDs exist solely as a kustomize overlay with no plain files a
    `crdDir`/`crdFile` could target.
  - `fluxInstance` — the Flux special case: a typed FluxInstance manifest with
    the resolved version is piped through `flux-operator build instance -f -`.

Any `input` may carry a `releaseTag` glob (e.g. `v*`) constraining version
resolution to the highest matching release tag, for repos where
`/releases/latest` surfaces the wrong tag: interleaved unrelated releases
(external-secrets' `helm-chart-*`) or two concurrent release lines (strimzi's
`0.x` still serves `v1beta2`, its `1.x` serves `v1` only). A `crdDir` input
may carry an `exclude` list of basename globs for directories that vendor
another source's CRDs (Calico vendors a `policy.networking.k8s.io_*` CRD owned
by network-policy-api, which would trip the cross-source conflict guard); each
glob must match at least one file or the build fails loud.

Every extraction runs with `--strip-description=false --with-field-index
--with-explain-type-metadata --index-source="<alias> <version> <url>"` and the
`{{ .Group }}/{{ .Kind }}_{{ .Version }}.json` output template. The binary
lowercases template variables, so catalog filenames are lowercase.

**Fieldless kinds are pruned.** After staging, `pruneKindsWithoutFields` drops
every file of a kind that has no `.fields.txt` index — the Kubernetes `*List`
aggregates the swagger extractors emit. The filter is kind-scoped: a kind
keeps all its schema versions as long as one is indexed. Pruning happens
before sync; GC removes any List schemas left by an earlier build. Because
filenames are lowercased, the field index is the only record of the original
kind casing (`kind <string> enum=<Kind>`): `kindCasing` reads it back into the
manifest's `kinds` map, which the web index uses for display.

The assembled CRD stream is also parsed for `spec.names` so history records
the discovery names kubectl-style references need; splitting on column-0
`---` is safe because block-scalar content is always indented.

**Pipeline stages are separate `$` calls on purpose.** A Bun-shell pipeline,
like bash without pipefail, reports only the last command's exit code — a
failing `kubectl kustomize | flux-schema` once passed silently with zero
output. Producers run alone via `.text()`, then the YAML is fed to
`flux-schema extract crd /dev/stdin` with `< ${new Response(yaml)}`.

## History manifests — the source of truth

`build/history/<name>.json` records per source:

- `repo`, resolved `version`, and the `commit` SHA the extraction ref pointed
  at when built (tags are mutable, only the SHA pins the input; for OpenShift
  it is the release-branch head);
- `builtAt` timestamp and `fluxSchemaVersion`;
- `inputDigest` — sha256 of the YAML stream piped to flux-schema; pins what
  the commit cannot (release assets can be re-uploaded on a tag). Absent for
  the swagger extractors, whose CLI fetches its own input;
- `filesDigest` — sha256 over one `<path>:<sha256(content)>` line per catalog
  file, sorted by path: tamper evidence for the source's file set;
- `kinds` — keyed by original-cased `<group>/<Kind>` (the slug is recovered by
  lowercasing), with CRD discovery names as values (`{}` when unavailable);
- `files` — the sorted repo-root-relative catalog files the source owns.

Everything derives from these manifests:

- **Skip detection**: resolved version == manifest version AND every listed
  file exists on disk (so a partially-synced catalog self-heals). `--force`
  bypasses.
- **GC**: files in the previous manifest missing from the new build are
  deleted — but never files owned by another source's manifest. Sync likewise
  refuses to overwrite a foreign-owned path; a collision fails that source.
- **Orphan GC**: on full builds, a manifest whose name left sources.yaml gets
  its files deleted and the manifest removed.
- **Regen**: `regen` rebuilds at the manifest's pinned version.
- **README + PR body**: both rendered from manifests, never hand-edited.

Write ordering is sync → GC → history (atomic tmp+rename, written last), so a
crash leaves the manifest describing the previous consistent state and the
next run converges. A corrupt manifest is dropped with a warning and the
source rebuilds from scratch. Failures are per-source: one source failing
never blocks the others; the run exits 1 at the end.

The update workflow signs SLSA build provenance (`actions/attest`) for the
manifests that run rebuilt: subjects must be artifacts the run produced, so
unchanged manifests keep the attestation of the run that wrote them, and a
force dispatch rebuilds and attests all. Since each manifest pins its catalog
files via `filesDigest`, an attested manifest covers its slice of the catalog.
Verify with:

```shell
gh attestation verify build/history/<name>.json -R controlplaneio-fluxcd/schema-catalog
```

**Manual changes to `catalog/` and `build/history/` break the attestations.**
An attestation is bound to the exact manifest bytes, so a manifest built
outside CI matches no signed subject and verification fails for it and the
catalog files it pins. These files are updated in CI only. If pushing locally
built manifests is ever unavoidable, force-dispatch `update-catalog` right
after so every source is rebuilt and re-attested.

## CLI

```shell
cd build
bun src/main.ts build [--source <name>] [--force] [--summary <path>] [--concurrent <n>]
bun src/main.ts regen [--source <name>] [--concurrent <n>]
# or from the repo root: make deps / lint / test / build
# make build honors FORCE_BUILD=1, BUILD_SUMMARY=<path>, RUN_TO_COMPLETION=1
# and CONCURRENT=<n> env/vars
```

Env: `FLUX_SCHEMA_BIN` (single binary path, not a command line),
`GITHUB_TOKEN` (raises API rate limits; github.ts retries 429/5xx with
backoff), `GITHUB_OUTPUT` (when set, the build appends `changed=true|false`,
which gates the update workflow's smoke-test and PR steps).

`--concurrent` defaults to `2`; per-source failure handling is unchanged,
every source is always attempted.

## Running a full regen

A full regen rebuilds every source at its pinned manifest version. Use it
locally to prove a build-system change is behavior-preserving (at pinned
versions the catalog must come out byte-identical) or to trial a new manifest
field. It is a verification tool, not a way to ship: generated files reach
`main` through CI only (see the attestation rule above).

```shell
cd build
bun src/main.ts regen --concurrent=2 2>&1 | tee /tmp/regen.log
```

- Keep concurrency at the default 2; higher values compound GitHub rate
  limiting and bandwidth contention on the big-repo fetches.
- kubectl's hard-coded 27s git timeout can fail `kustomize` inputs of large
  repos on slow connections. The run attempts every source regardless; retry
  stragglers one at a time with `regen --source <name>`.
- A clean regen reports `+0 -0 ~0` per source and `git status --short --
  catalog` stays empty. `~N` is the byte-level signal: `+`/`-` only track
  added and removed paths, so a rebuild that rewrote existing schemas still
  shows `+0 -0`. Any catalog diff means a code change altered extraction.
- Retries re-render the README versions table from the on-disk manifests, so
  a partial run self-heals.
- Every processed manifest churns `builtAt`; when done, discard the churn
  with `git checkout -- build/history` (and the README if only dates moved).

## Testing boundaries

`bun test` covers pure logic only: config validation, version helpers, the
endoflife.date picker, GC diffing, renderers, asset-glob matching, and the
FluxInstance manifest shape. Nothing shells out or touches the network, which
is what lets `test.yaml` in CI need only Bun. Extraction correctness is
verified by the build's own guards and by the update workflow's smoke test
(validating `fluxcd/flux2-kustomize-helm-example` against the fresh catalog).
Keep it that way: new pure logic gets unit tests; new side effects get guards
or a CI check, not mocks.

## Adding a source

Add an entry to `build/config/sources.yaml` (`types.ts` has the shape,
`config.ts` the validation rules) and run `make build` to verify the
extraction locally. Commit only the config change: the new source's catalog
files, history manifest and README rows must come out of CI so they are
attested. The update workflow builds any source that has no manifest yet, so
once the config merges, dispatch `update-catalog` (no force needed) or let
the daily run pick it up.

`category` (required) is the source's CNCF landscape top-level group; allowed
values are the `CATEGORIES` const in `config.ts`. Pick the `input` by how the
project ships its CRDs — a CRD-only `releaseAsset` when one exists, else
`crdDir`/`crdFile`, and `kustomize` only as a last resort (it clones the whole
repo; see the extraction model above). A resolved tag is
used verbatim as the git ref, so bare tags (strimzi's `0.51.0`, no `v`) are
supported and appear un-prefixed in the table.

`cncf` is optional: one of `graduated`, `incubating`, or `sandbox`; leave it
unset for non-CNCF and archived projects. The authoritative lookup is the
landscape data export:

```shell
curl -sL https://landscape.cncf.io/data/full.json | jq -r --arg repo "<owner>/<repo>" '.items[] | select((.repositories // []) | any(.url | contains($repo))) | "\(.name): \(.maturity)"'
```

A sub-repo missing from the landscape inherits its parent project's maturity
(Flagger is part of Flux, so graduated; nack is part of NATS, so incubating).
`kubernetes-sigs/*` repos are Kubernetes sub-projects, not standalone CNCF
projects, and stay unmarked; the web UI derives a SIG badge from the repo org
instead.

### Grouping sources into a project

When several sources are really one upstream project (the twenty `ack-*`
controllers, the five Cluster API repos), declare a group in the top-level
`projects:` list and reference it from each member with `project: <name>`:

```yaml
projects:
  - name: aws-ack
    alias: AWS Controllers for Kubernetes
    category: "Provisioning"
    url: https://github.com/aws-controllers-k8s

sources:
  - name: ack-s3
    alias: AWS S3 Controller
    project: aws-ack
    url: https://github.com/aws-controllers-k8s/s3-controller
    extract: crd
    input:
      crdDir: config/crd/bases
```

Grouping is presentation-only: extraction, history manifests, catalog files,
and the README versions table stay per-source; the web index and MCP merge the
members into one project. The validator enforces:

- members inherit `category` and `cncf` from the group and must not set them
  (nor `pin` — a pinned group carries the pin itself);
- a group needs at least two members;
- a group may share its name with one of its own members (the `karpenter`
  group contains the `karpenter` source), but not with an unrelated source or
  another group.

The group `url` may be a bare GitHub organization when no single repo
represents the project — except Kubernetes SIG groups, which must keep a full
`kubernetes-sigs/<repo>` URL: the web UI derives the SIG badge and CNCF filter
scope from the `kubernetes-sigs/` repo prefix.

**A green build does not mean the schemas are correct.** The guards only check
that extraction produced files and that no two sources collide; nothing
verifies the shape of what came out. The extraction transforms can silently
mangle a schema, and the damage only surfaces when a realistic resource is
validated against it. Before shipping a new source, validate a complex,
representative manifest (union specs, deep nesting, int-or-string fields)
against the freshly built catalog:

```shell
flux-schema validate <real-manifest.yaml> --schema-location ./catalog
```

Confirm both directions: a valid manifest must pass (a false rejection means
the schema is over-strict) and an intentionally broken one must fail (a false
accept means it is too loose). Cilium is the cautionary tale: the build was
green and the schemas looked plausible, but every valid `CiliumNetworkPolicy`
was rejected because a flux-schema bug (fixed in 0.7.1) injected
`additionalProperties: false` into the spec's `oneOf` branches — only a
real-resource validation would have caught it.
