#  Kubernetes Ecosystem Schema Catalog

A hosted catalog of JSON Schemas and LLM-optimized indexes for Kubernetes, OpenShift,
Flux and other CNCF projects, generated with
[flux-schema](https://github.com/fluxcd/flux-schema) and refreshed daily from
upstream stable releases.

Point `flux schema validate` at this catalog to validate your manifests against
always-current schemas, including CRDs beyond the CLI's built-in `default`
catalog (e.g. cert-manager), without having to extract them yourself or
upgrade the CLI to pick up new versions.

## Using the catalog

The catalog is served straight from GitHub over HTTPS at the base URL.

Pass the base URL as a `--schema-location`:

```shell
flux schema validate ./manifests \
  --schema-location https://raw.githubusercontent.com/controlplaneio-fluxcd/schema-catalog/main/catalog
```

### Config file

To make the catalog the default for a repository, set it in a `.fluxschema.yml`
config file so local runs and CI share the same configuration:

```yaml
apiVersion: schema.plugin.fluxcd.io/v1beta1
kind: Config
validate:
  schemaLocation:
    - https://raw.githubusercontent.com/controlplaneio-fluxcd/schema-catalog/main/catalog
  verbose: true
```

```shell
flux schema validate ./manifests --config .fluxschema.yml
```

## Field indexes for AI agents

Each schema ships a `.fields.txt` sibling: a self-contained, line-oriented
index of every field. AI Agents can grep these instead of
querying a live cluster with `kubectl explain`:

```shell
grep 'images' catalog/kustomize.toolkit.fluxcd.io/kustomization_v1.fields.txt
```

Each line carries the field's dotted path, type, constraints and description.
See the [field index reference](https://github.com/fluxcd/flux-schema/blob/main/docs/field-index.md)
for the line grammar.

## Coverage

<!-- versions:start -->
| Project | Version | Updated |
| --- | --- | --- |
| Kubernetes | [v1.36.2](build/history/kubernetes.json) | 2026-07-05 |
| OpenShift | [v4.20](build/history/openshift.json) | 2026-07-05 |
| Flux | [v2.9.0](build/history/flux.json) | 2026-07-05 |
| Flagger | [v1.43.0](build/history/flagger.json) | 2026-07-05 |
| Flux Operator | [v0.53.0](build/history/flux-operator.json) | 2026-07-05 |
| Cluster API | [v1.13.3](build/history/cluster-api.json) | 2026-07-05 |
| Gateway API | [v1.6.0](build/history/gateway-api.json) | 2026-07-05 |
| Cert Manager | [v1.20.3](build/history/cert-manager.json) | 2026-07-05 |
| External Secrets | [v2.7.0](build/history/external-secrets.json) | 2026-07-05 |
| Cilium | [v1.19.5](build/history/cilium.json) | 2026-07-05 |
| Prometheus Operator | [v0.92.1](build/history/prometheus-operator.json) | 2026-07-05 |
| VictoriaMetrics Operator | [v0.72.0](build/history/victoriametrics-operator.json) | 2026-07-05 |
| Fluent Operator | [v3.9.0](build/history/fluent-operator.json) | 2026-07-05 |
| KEDA | [v2.20.1](build/history/keda.json) | 2026-07-05 |
| Knative Serving | [knative-v1.22.1](build/history/knative-serving.json) | 2026-07-05 |
| Knative Eventing | [knative-v1.22.2](build/history/knative-eventing.json) | 2026-07-05 |
| Tekton Pipeline | [v1.14.0](build/history/tekton-pipeline.json) | 2026-07-05 |
| Kyverno | [v1.18.1](build/history/kyverno.json) | 2026-07-05 |
| Rook | [v1.20.1](build/history/rook.json) | 2026-07-05 |
| Vitess Operator | [v2.17.0](build/history/vitess-operator.json) | 2026-07-05 |
| Strimzi | [0.51.0](build/history/strimzi.json) | 2026-07-05 |
| NATS | [v0.23.0](build/history/nats.json) | 2026-07-05 |
| OpenTelemetry | [v0.154.0](build/history/opentelemetry.json) | 2026-07-05 |
| OPA Gatekeeper | [v3.22.2](build/history/gatekeeper.json) | 2026-07-05 |
| Envoy Gateway | [v1.8.2](build/history/envoy-gateway.json) | 2026-07-05 |
| Longhorn | [v1.12.0](build/history/longhorn.json) | 2026-07-05 |
| Vertical Pod Autoscaler | [vertical-pod-autoscaler-1.7.0](build/history/vertical-pod-autoscaler.json) | 2026-07-05 |
| Kueue | [v0.18.2](build/history/kueue.json) | 2026-07-05 |
| CloudNativePG | [v1.30.0](build/history/cloudnative-pg.json) | 2026-07-05 |
| Secrets Store CSI Driver | [v1.6.0](build/history/secrets-store-csi-driver.json) | 2026-07-05 |
| Velero | [v1.18.2](build/history/velero.json) | 2026-07-05 |
| Crossplane | [v2.3.3](build/history/crossplane.json) | 2026-07-05 |
<!-- versions:end -->

## Documentation

- [Flux Schema CLI](https://github.com/fluxcd/flux-schema): the validator this catalog serves.
- [Manifest validation guide](https://github.com/fluxcd/flux-schema/blob/main/docs/manifests-validation.md): flags, schema resolution, CEL rules and config files.
- [Custom catalog guide](https://github.com/fluxcd/flux-schema/blob/main/docs/custom-schema-catalog.md): extract and host your own schemas.
