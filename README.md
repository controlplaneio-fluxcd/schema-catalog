# Flux Schema Catalog

Catalog of JSON Schemas and field indexes for Kubernetes, OpenShift,
the Flux ecosystem and other CNCF projects, generated with
[flux-schema](https://github.com/fluxcd/flux-schema).

The JSON Schemas (`catalog/<group>/<Kind>_<version>.json`, descriptions
included) serve `flux-schema validate`. The field indexes
(`catalog/<group>/<Kind>_<version>.fields.txt`) give AI agents an offline
`kubectl explain` replacement: one greppable line per field with its dotted
path, type, constraints and description.

<!-- versions:start -->
| Source | Version |
| --- | --- |
| [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes) | v1.36.2 |
| [openshift/api](https://github.com/openshift/api) | v4.20 |
| [fluxcd/flux2](https://github.com/fluxcd/flux2) | v2.9.0 |
| [fluxcd/flagger](https://github.com/fluxcd/flagger) | v1.43.0 |
| [controlplaneio-fluxcd/flux-operator](https://github.com/controlplaneio-fluxcd/flux-operator) | v0.53.0 |
| [kubernetes-sigs/gateway-api](https://github.com/kubernetes-sigs/gateway-api) | v1.6.0 |
| [cert-manager/cert-manager](https://github.com/cert-manager/cert-manager) | v1.20.3 |
<!-- versions:end -->

## Building the catalog

The catalog is populated by the Bun build system in [`build/`](build/):

```shell
cd build
bun install
bun run build              # resolve latest versions, extract, GC, update history
bun run build -- --source flux --force
bun run regen              # rebuild at the versions pinned in build/history
```

Sources are declared in [`build/sources.yaml`](build/sources.yaml) (format:
[`build/src/types.ts`](build/src/types.ts)). Each successful build writes a
provenance manifest to `build/history/<name>.json` recording the resolved
version, build time, flux-schema version and the catalog files owned by the
source; the manifests drive skip detection, garbage collection of removed
schemas and the versions table above.
