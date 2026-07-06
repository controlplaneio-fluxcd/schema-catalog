# Web runtime

Cloudflare Worker that serves <https://schemas.fluxoperator.dev> with three
surfaces: `/catalog/*` streams schema files from R2 for `flux-schema validate
--schema-location https://schemas.fluxoperator.dev/catalog`, `/` serves the
catalog explorer web UI, and `/mcp` exposes a stateless MCP server for AI
agents.

## Architecture

One Worker handles all dynamic traffic. The R2 bucket `schema-catalog` holds the
generated `catalog/` tree, synced by CI with rclone. Static assets are served
from Workers Assets: the dependency-free UI bundle, copied files from
`static/`, and the generated `index.json`. `wrangler.jsonc` sets
`assets.run_worker_first` to `["/catalog/*", "/mcp"]`, so catalog and MCP
requests enter the Worker while UI assets stay on the static path.

`/catalog/*` uses the edge Cache API. Cache keys include
`?v=${CATALOG_VERSION}`, and deployment sets `CATALOG_VERSION` from the commit
SHA, so each deploy rotates into a fresh keyspace without purging. Both hits and
404s are cached: `flux-schema` probes fallback schema names, so negative cache
entries avoid repeated R2 misses. Every `/catalog/*` response, including
preflight and 404, carries permissive CORS because the catalog is a public schema
location.

## Module map

| Path                        | Responsibility                                                              |
|-----------------------------|-----------------------------------------------------------------------------|
| `scripts/gen-index.ts`      | `build/history` + `sources.yaml` -> `dist/assets/index.json`                |
| `scripts/build-ui.ts`       | Bundles `src/ui/main.ts`, copies `static/` and `styles.css` into assets     |
| `scripts/dev.ts`            | Local dev: catalog file server + `wrangler dev`, rebundles UI on `src` change |
| `scripts/serve.ts`          | Local dev without wrangler: static UI + `catalog/` server, UI watch, SSE reload |
| `src/worker/index.ts`       | Worker router for `/catalog/*`, `/mcp`, and Workers Assets                  |
| `src/worker/catalog.ts`     | R2/dev-origin catalog object lookup, CORS, Cache API, HEAD/OPTIONS handling |
| `src/worker/mcp.ts`         | Streamable HTTP MCP server and tool registration                            |
| `src/worker/mcp-core.ts`    | Pure catalog/MCP result formatting and schema/fields lookup helpers         |
| `src/worker/index-data.ts`  | Loads and memoizes the generated index asset per `CATALOG_VERSION`          |
| `src/shared/types.ts`       | Compact generated index types shared by Worker, UI, tests, and generator    |
| `src/shared/index-query.ts` | Version ordering, exact kind lookup, and ranked catalog search              |
| `src/shared/fields.ts`      | `.fields.txt` parser, filter, and tree builder                              |
| `src/ui/**`                 | Dependency-free vanilla TypeScript SPA with hash routing                    |
| `static/`                   | Files copied verbatim into `dist/assets`                                    |
| `test/`                     | Bun tests for pure shared logic, Worker catalog behavior, MCP helpers       |

`scripts/dev.ts` is credential-free: it serves the repo-local `catalog/` tree on
a side port and passes `CATALOG_DEV_ORIGIN` into local Wrangler, so R2 is not
needed for `make web-run`.

## Index contract

`dist/assets/index.json` is generated at build time from `build/history/*.json`
and `build/config/sources.yaml`. It is an asset, not source, and is never
committed.

```json
{
  "v": 1,
  "generatedAt": "2026-07-06T00:00:00.000Z",
  "categories": ["Provisioning", "Runtime"],
  "projects": [
    {
      "name": "flux",
      "alias": "Flux",
      "cat": 1,
      "repo": "fluxcd/flux2",
      "version": "v2.9.0",
      "builtAt": "2026-07-06",
      "groups": [
        {
          "g": "kustomize.toolkit.fluxcd.io",
          "kinds": [["kustomization", ["v1", "v1beta2"], 1]]
        }
      ]
    }
  ]
}
```

`projects[].groups[].kinds[]` is `[kind, versions, fieldsBits]`. `versions` is
sorted by Kubernetes API priority, newest/preferred first: stable versions before
beta, beta before alpha, higher major/sequence before lower. Bit `i` in
`fieldsBits` corresponds to `versions[i]`; set means
`<kind>_<version>.fields.txt` exists, unset means schema-only.

## MCP

Endpoint: streamable HTTP at <https://schemas.fluxoperator.dev/mcp>, no
authentication. The catalog is framed to agents as an authoritative source of
Kubernetes-ecosystem API definitions for generating, editing, and validating
manifests — not as a `flux-schema` backend. The human-facing overview page is
at <https://schemas.fluxoperator.dev/#/mcp-server> (SPA route
`src/ui/views/mcp.ts`).

| Tool             | Description                                                                   |
|------------------|-------------------------------------------------------------------------------|
| `search_catalog` | Resolve a keyword (project, group, or kind) to matching groups/kinds/versions |
| `list_projects`  | Enumerate catalog projects, optionally filtered by CNCF category              |
| `get_project`    | Fetch one project's groups, kinds, versions, and field-index coverage         |
| `get_schema`     | Fetch the full JSON Schema for a group/kind/version (256 KiB inline guard)    |
| `search_fields`  | Look up exact field paths, types, constraints, and descriptions for a kind    |

The server `instructions` steer agents through a discover → `search_fields` →
`get_schema` escalation so most field questions never load a full schema.

```shell
claude mcp add --transport http flux-schema-catalog https://schemas.fluxoperator.dev/mcp
```

## Commands

From the repo root:

```shell
make web-build   # install, lint, test, generate index, bundle UI
make web-run     # local Worker + local catalog/ file server, no CF credentials
make web-dev     # UI-only dev server, no wrangler; watches src and live-reloads (no /mcp)
make web-sync    # rclone sync catalog/ to r2:schema-catalog
make web-deploy  # wrangler deploy with CATALOG_VERSION from commit SHA
```

Inside `web/`:

```shell
bun run lint       # tsc -p tsconfig.worker.json && tsc -p tsconfig.ui.json
bun test
bun run gen-index
bun run build
bun run dev         # wrangler dev (Worker + MCP)
bun run serve       # wrangler-free UI dev server (PORT overrides :8787)
bun run deploy
```

`tsconfig.json` is solution-style and only references the real projects. Keep
Worker and UI type universes separate: the Worker build needs
`@cloudflare/workers-types`, while the UI/scripts build needs DOM globals. Those
ambient declarations overlap and conflict if compiled as one project.

## Deployment

Cloudflare Workers Builds is git-connected. The build command is
`make web-build`; the deploy command is `make web-sync web-deploy`.

The build environment is configured in the Workers Builds settings under
Settings > Build > Build variables and secrets:

| Variable                             | Value                                           | Type      |
|--------------------------------------|-------------------------------------------------|-----------|
| `BUN_VERSION`                        | `1` (resolves to the latest 1.x)                | plaintext |
| `RCLONE_CONFIG_R2_TYPE`              | `s3`                                            | plaintext |
| `RCLONE_CONFIG_R2_PROVIDER`          | `Cloudflare`                                    | plaintext |
| `RCLONE_CONFIG_R2_ENDPOINT`          | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | plaintext |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID`     | R2 API token key ID                             | secret    |
| `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | R2 API token secret                             | secret    |

`BUN_VERSION` is pinned because the image's default Bun is too old for
`Bun.YAML` (needs >= 1.2.21); the build log's setup phase records the resolved
version. The R2 API token has Object Read & Write
permission scoped to the `schema-catalog` bucket only. `make web-sync` uses the
`RCLONE_CONFIG_R2_*` variables to sync the local `catalog/` tree into that
bucket.
`make web-deploy` sets `CATALOG_VERSION` from `WORKERS_CI_COMMIT_SHA`; local
runs fall back to `git rev-parse HEAD`. The first deploy provisions the
`schemas.fluxoperator.dev` custom domain from `wrangler.jsonc` routes.

## Verification

```shell
cd web
bun run lint
bun test
bun run build
```

HTTP smoke matrix:

```shell
curl -fsS https://schemas.fluxoperator.dev/
curl -fsSI https://schemas.fluxoperator.dev/catalog/kustomize.toolkit.fluxcd.io/kustomization_v1.json
curl -fsSI https://schemas.fluxoperator.dev/catalog/kustomize.toolkit.fluxcd.io/kustomization_v1.fields.txt
curl -sS -o /dev/null -w '%{http_code}\n' https://schemas.fluxoperator.dev/catalog/missing.example.io/missing_v1.json
curl -fsS https://schemas.fluxoperator.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"dev"}}}'
```

Validation must pass both directions: a valid manifest passes, and the same
manifest with an intentionally invalid field fails.

```shell
flux-schema validate valid.yaml --schema-location https://schemas.fluxoperator.dev/catalog
! flux-schema validate broken.yaml --schema-location https://schemas.fluxoperator.dev/catalog
```
