#  Kubernetes Ecosystem Schema Catalog

<!-- stats:start -->
![Projects](https://img.shields.io/badge/Projects-86-2088FF?style=flat-square) ![Schemas](https://img.shields.io/badge/Schemas-8%2C419-3FB950?style=flat-square) ![Catalog size](https://img.shields.io/badge/Catalog%20size-584%20MB-8957E5?style=flat-square)
<!-- stats:end -->

A hosted catalog of JSON Schemas and LLM-optimized indexes for Kubernetes and the CNCF Ecosystem,
generated with [flux-schema](https://github.com/fluxcd/flux-schema) and refreshed daily from
upstream stable releases.

## Using the catalog for validation

The catalog is served from Cloudflare's global network at
[schemas.fluxoperator.dev](https://schemas.fluxoperator.dev), where you can
also search and browse every project and their schemas.

```shell
flux schema validate ./manifests -s ecosystem
```

The `ecosystem` schema location expands to
`https://schemas.fluxoperator.dev/catalog`.

See the [CLI guide](https://schemas.fluxoperator.dev/cli) for installation,
CI usage and configuration.

## Explaining fields without a cluster

The `explain` command is like `kubectl explain` without a cluster at
hand (AI agents get the same capability through the MCP server below):

```shell
flux schema explain -s ecosystem hr.spec.dependsOn
```

```text
GROUP:      helm.toolkit.fluxcd.io
KIND:       HelmRelease
VERSION:    v2

FIELD: dependsOn <[]Object>

DESCRIPTION:
    DependsOn may contain a DependencyReference slice with references to
    HelmRelease resources that must be ready before this HelmRelease can be
    reconciled.
...
```

Add `--recursive` to print nested fields, and `--api-version` to pick a
specific group/version when a kind is served by more than one.

## MCP Server for AI agents

The catalog is exposed as a remote MCP server (streamable HTTP, no
authentication) at `https://schemas.fluxoperator.dev/mcp`. It gives AI agents
an offline replacement for `kubectl explain`, backed by the `.fields.txt`
[field indexes](https://github.com/fluxcd/flux-schema/blob/main/docs/field-index.md)
that ship alongside every schema.

To use it, add the MCP config to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "flux-schema-catalog": {
      "type": "http",
      "url": "https://schemas.fluxoperator.dev/mcp"
    }
  }
}
```

See the [AI agents guide](https://schemas.fluxoperator.dev/agents) for the
available tools and per-client setup instructions.

## Catalog

Each project's ID names its provenance manifest, which pins the upstream
commit and the digests of the generated files. The manifests are signed with
[GitHub Artifact Attestations](https://github.com/controlplaneio-fluxcd/schema-catalog/attestations)
and can be verified with the GitHub CLI:

```shell
curl -sO https://schemas.fluxoperator.dev/history/<ID>.json
gh attestation verify <ID>.json -R controlplaneio-fluxcd/schema-catalog
```

<!-- versions:start -->
### Platform

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Kubernetes](https://schemas.fluxoperator.dev/p/kubernetes) | `kubernetes` | v1.36.2 | 101 | 2026-07-08 |
| [OpenShift](https://schemas.fluxoperator.dev/p/openshift) | `openshift` | v4.20 | 133 | 2026-07-08 |

### Provisioning

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [1Password Operator](https://schemas.fluxoperator.dev/p/onepassword-operator) | `onepassword-operator` | v1.12.0 | 1 | 2026-07-08 |
| [AWS ACM Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-acm` | v1.4.3 | 1 | 2026-07-08 |
| [AWS API Gateway v2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-apigatewayv2` | v1.3.3 | 9 | 2026-07-08 |
| [AWS DynamoDB Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-dynamodb` | v1.9.2 | 3 | 2026-07-08 |
| [AWS EC2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-ec2` | v1.18.2 | 20 | 2026-07-08 |
| [AWS ECR Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-ecr` | v1.6.3 | 3 | 2026-07-08 |
| [AWS EFS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-efs` | v1.4.1 | 3 | 2026-07-08 |
| [AWS EKS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-eks` | v1.16.2 | 8 | 2026-07-08 |
| [AWS ElastiCache Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-elasticache` | v1.5.2 | 9 | 2026-07-08 |
| [AWS IAM Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-iam` | v1.7.3 | 7 | 2026-07-08 |
| [AWS Kinesis Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-kinesis` | v1.3.2 | 1 | 2026-07-08 |
| [AWS KMS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-kms` | v1.3.3 | 3 | 2026-07-08 |
| [AWS Lambda Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-lambda` | v1.14.1 | 7 | 2026-07-08 |
| [AWS MemoryDB Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-memorydb` | v1.4.1 | 6 | 2026-07-08 |
| [AWS RDS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-rds` | v1.10.1 | 10 | 2026-07-08 |
| [AWS Route 53 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-route53` | v1.4.4 | 3 | 2026-07-08 |
| [AWS S3 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-s3` | v1.8.1 | 1 | 2026-07-08 |
| [AWS SageMaker Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sagemaker` | v1.8.3 | 26 | 2026-07-08 |
| [AWS Secrets Manager Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-secretsmanager` | v1.3.2 | 1 | 2026-07-08 |
| [AWS SNS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sns` | v1.7.1 | 4 | 2026-07-08 |
| [AWS SQS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sqs` | v1.5.4 | 1 | 2026-07-08 |
| [Azure Service Operator](https://schemas.fluxoperator.dev/p/azure-service-operator) | `azure-service-operator` | v2.20.0 | 1324 | 2026-07-08 |
| [Capsule](https://schemas.fluxoperator.dev/p/capsule) | `capsule` | v0.13.9 | 12 | 2026-07-08 |
| [Cert Manager](https://schemas.fluxoperator.dev/p/cert-manager) | `cert-manager` | v1.20.3 | 6 | 2026-07-08 |
| [Cluster API](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api` | v1.13.3 | 36 | 2026-07-08 |
| [Cluster API Add-on Provider Helm](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-addon-provider-helm` | v0.6.4 | 2 | 2026-07-08 |
| [Cluster API OpenStack](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-openstack` | v0.14.6 | 7 | 2026-07-08 |
| [Cluster API Operator](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-operator` | v0.27.0 | 7 | 2026-07-08 |
| [Cluster API vSphere](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-vsphere` | v1.16.1 | 16 | 2026-07-08 |
| [Crossplane](https://schemas.fluxoperator.dev/p/crossplane) | `crossplane` | v2.3.3 | 25 | 2026-07-08 |
| [External Secrets](https://schemas.fluxoperator.dev/p/external-secrets) | `external-secrets` | v2.7.0 | 28 | 2026-07-08 |
| [Falco Operator](https://schemas.fluxoperator.dev/p/falco-operator) | `falco-operator` | v0.4.1 | 5 | 2026-07-08 |
| [GCP Config Connector](https://schemas.fluxoperator.dev/p/config-connector) | `config-connector` | v1.153.0 | 578 | 2026-07-08 |
| [kro](https://schemas.fluxoperator.dev/p/kro) | `kro` | v0.9.2 | 2 | 2026-07-08 |
| [Kubescape Operator](https://schemas.fluxoperator.dev/p/kubescape-operator) | `kubescape-operator` | 1.40.2 | 5 | 2026-07-08 |
| [Kubewarden](https://schemas.fluxoperator.dev/p/kubewarden) | `kubewarden` | v1.36.0 | 8 | 2026-07-08 |
| [Kyverno](https://schemas.fluxoperator.dev/p/kyverno) | `kyverno` | v1.18.1 | 47 | 2026-07-08 |
| [OPA Gatekeeper](https://schemas.fluxoperator.dev/p/gatekeeper) | `gatekeeper` | v3.22.2 | 27 | 2026-07-08 |
| [OpenReports](https://schemas.fluxoperator.dev/p/openreports) | `openreports` | v0.2.1 | 2 | 2026-07-08 |
| [Secrets Store CSI Driver](https://schemas.fluxoperator.dev/p/secrets-store-csi-driver) | `secrets-store-csi-driver` | v1.6.0 | 4 | 2026-07-08 |
| [Sigstore Policy Controller](https://schemas.fluxoperator.dev/p/sigstore-policy-controller) | `sigstore-policy-controller` | v0.15.1 | 3 | 2026-07-08 |
| [SPIRE Controller Manager](https://schemas.fluxoperator.dev/p/spire-controller-manager) | `spire-controller-manager` | v0.6.6 | 4 | 2026-07-08 |
| [Trust Manager](https://schemas.fluxoperator.dev/p/trust-manager) | `trust-manager` | v0.24.0 | 2 | 2026-07-08 |
| [Upbound AWS Provider](https://schemas.fluxoperator.dev/p/provider-upjet-aws) | `provider-upjet-aws` | v2.6.0 | 2364 | 2026-07-08 |
| [Upbound Azure Provider](https://schemas.fluxoperator.dev/p/provider-upjet-azure) | `provider-upjet-azure` | v2.6.0 | 1789 | 2026-07-08 |
| [Upbound GCP Provider](https://schemas.fluxoperator.dev/p/provider-upjet-gcp) | `provider-upjet-gcp` | v2.6.0 | 1018 | 2026-07-08 |

### Runtime

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Antrea](https://schemas.fluxoperator.dev/p/antrea) | `antrea` | v2.6.2 | 20 | 2026-07-08 |
| [Calico](https://schemas.fluxoperator.dev/p/calico) | `calico` | v3.32.1 | 22 | 2026-07-08 |
| [Cilium](https://schemas.fluxoperator.dev/p/cilium) | `cilium` | v1.19.5 | 29 | 2026-07-08 |
| [Container Object Storage Interface](https://schemas.fluxoperator.dev/p/cosi) | `cosi` | v0.2.2 | 5 | 2026-07-08 |
| [Kube-OVN](https://schemas.fluxoperator.dev/p/kube-ovn) | `kube-ovn` | v1.16.2 | 24 | 2026-07-08 |
| [Longhorn](https://schemas.fluxoperator.dev/p/longhorn) | `longhorn` | v1.12.0 | 23 | 2026-07-08 |
| [Network Policy API](https://schemas.fluxoperator.dev/p/network-policy-api) | `network-policy-api` | v0.2.0 | 1 | 2026-07-08 |
| [Rook](https://schemas.fluxoperator.dev/p/rook) | `rook` | v1.20.2 | 21 | 2026-07-08 |
| [Submariner](https://schemas.fluxoperator.dev/p/submariner) | `submariner` | v0.24.0 | 9 | 2026-07-08 |
| [Submariner Operator](https://schemas.fluxoperator.dev/p/submariner) | `submariner-operator` | v0.24.0 | 3 | 2026-07-08 |
| [Tailscale](https://schemas.fluxoperator.dev/p/tailscale) | `tailscale` | v1.98.8 | 7 | 2026-07-08 |
| [Tigera Operator](https://schemas.fluxoperator.dev/p/calico) | `tigera-operator` | v3.32.1 | 9 | 2026-07-08 |
| [Velero](https://schemas.fluxoperator.dev/p/velero) | `velero` | v1.18.2 | 11 | 2026-07-08 |

### Orchestration & Management

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [AWS Load Balancer Controller](https://schemas.fluxoperator.dev/p/aws-load-balancer-controller) | `aws-load-balancer-controller` | v3.4.1 | 8 | 2026-07-08 |
| [Envoy Gateway](https://schemas.fluxoperator.dev/p/envoy-gateway) | `envoy-gateway` | v1.8.2 | 8 | 2026-07-08 |
| [ExternalDNS](https://schemas.fluxoperator.dev/p/external-dns) | `external-dns` | v0.21.0 | 1 | 2026-07-08 |
| [Gateway API](https://schemas.fluxoperator.dev/p/gateway-api) | `gateway-api` | v1.6.0 | 21 | 2026-07-08 |
| [Istio](https://schemas.fluxoperator.dev/p/istio) | `istio` | 1.30.2 | 33 | 2026-07-08 |
| [JobSet](https://schemas.fluxoperator.dev/p/jobset) | `jobset` | v0.12.0 | 1 | 2026-07-08 |
| [Karpenter](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter` | v1.10.1 | 3 | 2026-07-08 |
| [Karpenter AWS](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-aws` | v1.13.0 | 1 | 2026-07-08 |
| [Karpenter Azure](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-azure` | v1.13.1 | 2 | 2026-07-08 |
| [Karpenter Cluster API](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-provider-cluster-api` | v0.2.0 | 1 | 2026-07-08 |
| [Karpenter IBM Cloud](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-provider-ibm-cloud` | v1.0.4 | 1 | 2026-07-08 |
| [KEDA](https://schemas.fluxoperator.dev/p/keda) | `keda` | v2.20.1 | 6 | 2026-07-08 |
| [kgateway](https://schemas.fluxoperator.dev/p/kgateway) | `kgateway` | v2.3.5 | 8 | 2026-07-08 |
| [kjob](https://schemas.fluxoperator.dev/p/kjob) | `kjob` | v0.1.0 | 5 | 2026-07-08 |
| [KubeEdge](https://schemas.fluxoperator.dev/p/kubeedge) | `kubeedge` | v1.23.0 | 18 | 2026-07-08 |
| [Kueue](https://schemas.fluxoperator.dev/p/kueue) | `kueue` | v0.18.2 | 22 | 2026-07-08 |
| [KWOK](https://schemas.fluxoperator.dev/p/kwok) | `kwok` | v0.8.0 | 12 | 2026-07-08 |
| [LeaderWorkerSet](https://schemas.fluxoperator.dev/p/lws) | `lws` | v0.9.0 | 2 | 2026-07-08 |
| [NFD NodeResourceTopology](https://schemas.fluxoperator.dev/p/node-feature-discovery) | `node-feature-discovery-nrt` | v0.18.3 | 2 | 2026-07-08 |
| [Node Feature Discovery](https://schemas.fluxoperator.dev/p/node-feature-discovery) | `node-feature-discovery` | v0.18.3 | 3 | 2026-07-08 |
| [Vertical Pod Autoscaler](https://schemas.fluxoperator.dev/p/vertical-pod-autoscaler) | `vertical-pod-autoscaler` | 1.7.0 | 4 | 2026-07-08 |
| [Volcano](https://schemas.fluxoperator.dev/p/volcano) | `volcano` | v1.15.0 | 9 | 2026-07-08 |
| [Volcano JobFlow](https://schemas.fluxoperator.dev/p/volcano) | `volcano-jobflow` | v1.15.0 | 2 | 2026-07-08 |

### App Definition & Development

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Actions Runner Controller](https://schemas.fluxoperator.dev/p/actions-runner-controller) | `actions-runner-controller` | 0.14.2 | 9 | 2026-07-08 |
| [Argo CD](https://schemas.fluxoperator.dev/p/argo) | `argo-cd` | v3.4.4 | 3 | 2026-07-08 |
| [Argo Events](https://schemas.fluxoperator.dev/p/argo) | `argo-events` | v1.9.10 | 3 | 2026-07-08 |
| [Argo Rollouts](https://schemas.fluxoperator.dev/p/argo) | `argo-rollouts` | v1.9.0 | 5 | 2026-07-08 |
| [Argo Workflows](https://schemas.fluxoperator.dev/p/argo) | `argo-workflows` | v4.0.7 | 8 | 2026-07-08 |
| [CloudNativePG](https://schemas.fluxoperator.dev/p/cloudnative-pg) | `cloudnative-pg` | v1.30.0 | 11 | 2026-07-08 |
| [Dapr](https://schemas.fluxoperator.dev/p/dapr) | `dapr` | v1.18.1 | 8 | 2026-07-08 |
| [Flagger](https://schemas.fluxoperator.dev/p/flagger) | `flagger` | v1.43.0 | 3 | 2026-07-08 |
| [Flux](https://schemas.fluxoperator.dev/p/flux) | `flux` | v2.9.1 | 15 | 2026-07-08 |
| [Flux Operator](https://schemas.fluxoperator.dev/p/flux-operator) | `flux-operator` | v0.54.1 | 4 | 2026-07-08 |
| [Kargo](https://schemas.fluxoperator.dev/p/kargo) | `kargo` | v1.10.8 | 9 | 2026-07-08 |
| [Knative Eventing](https://schemas.fluxoperator.dev/p/knative) | `knative-eventing` | v1.22.2 | 20 | 2026-07-08 |
| [Knative Serving](https://schemas.fluxoperator.dev/p/knative) | `knative-serving` | v1.22.1 | 12 | 2026-07-08 |
| [KServe](https://schemas.fluxoperator.dev/p/kserve) | `kserve` | v0.19.0 | 6 | 2026-07-08 |
| [KServe LLM](https://schemas.fluxoperator.dev/p/kserve) | `kserve-llmisvc` | v0.19.0 | 4 | 2026-07-08 |
| [MariaDB Operator](https://schemas.fluxoperator.dev/p/mariadb-operator) | `mariadb-operator` | 26.6.0 | 12 | 2026-07-08 |
| [NATS](https://schemas.fluxoperator.dev/p/nats) | `nats` | v0.23.0 | 8 | 2026-07-08 |
| [OpenFeature Operator](https://schemas.fluxoperator.dev/p/open-feature-operator) | `open-feature-operator` | v0.9.2 | 9 | 2026-07-08 |
| [RabbitMQ Cluster Operator](https://schemas.fluxoperator.dev/p/rabbitmq-cluster-operator) | `rabbitmq-cluster-operator` | v2.22.1 | 1 | 2026-07-08 |
| [Redis Operator](https://schemas.fluxoperator.dev/p/redis-operator) | `redis-operator` | v0.25.0 | 4 | 2026-07-08 |
| [ScyllaDB Operator](https://schemas.fluxoperator.dev/p/scylla-operator) | `scylla-operator` | v1.21.0 | 11 | 2026-07-08 |
| [Strimzi](https://schemas.fluxoperator.dev/p/strimzi) | `strimzi` | 0.51.0 | 24 | 2026-07-08 |
| [Tekton Pipeline](https://schemas.fluxoperator.dev/p/tekton-pipeline) | `tekton-pipeline` | v1.14.0 | 14 | 2026-07-08 |
| [Vitess Operator](https://schemas.fluxoperator.dev/p/vitess-operator) | `vitess-operator` | v2.17.0 | 8 | 2026-07-08 |

### Observability & Analysis

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Datadog Operator](https://schemas.fluxoperator.dev/p/datadog-operator) | `datadog-operator` | v1.28.0 | 13 | 2026-07-08 |
| [Elastic Cloud](https://schemas.fluxoperator.dev/p/eck-operator) | `eck-operator` | v3.4.1 | 19 | 2026-07-08 |
| [Fluent Operator](https://schemas.fluxoperator.dev/p/fluent-operator) | `fluent-operator` | v3.9.0 | 22 | 2026-07-08 |
| [Grafana Operator](https://schemas.fluxoperator.dev/p/grafana-operator) | `grafana-operator` | v5.24.0 | 13 | 2026-07-08 |
| [Jaeger Operator](https://schemas.fluxoperator.dev/p/jaeger-operator) | `jaeger-operator` | v1.65.0 | 1 | 2026-07-08 |
| [Litmus](https://schemas.fluxoperator.dev/p/litmus) | `litmus` | 3.30.0 | 3 | 2026-07-08 |
| [Logging Operator](https://schemas.fluxoperator.dev/p/logging-operator) | `logging-operator` | 6.7.0 | 21 | 2026-07-08 |
| [Loki Operator](https://schemas.fluxoperator.dev/p/loki-operator) | `loki-operator` | v0.10.2 | 9 | 2026-07-08 |
| [OpenSearch Operator](https://schemas.fluxoperator.dev/p/opensearch-operator) | `opensearch-operator` | 3.0.2 | 20 | 2026-07-08 |
| [OpenTelemetry](https://schemas.fluxoperator.dev/p/opentelemetry) | `opentelemetry` | v0.154.0 | 5 | 2026-07-08 |
| [Perses Operator](https://schemas.fluxoperator.dev/p/perses-operator) | `perses-operator` | v0.4.0 | 7 | 2026-07-08 |
| [Prometheus Operator](https://schemas.fluxoperator.dev/p/prometheus-operator) | `prometheus-operator` | v0.92.1 | 10 | 2026-07-08 |
| [Tempo Operator](https://schemas.fluxoperator.dev/p/tempo-operator) | `tempo-operator` | v0.21.0 | 2 | 2026-07-08 |
| [VictoriaMetrics Operator](https://schemas.fluxoperator.dev/p/victoriametrics-operator) | `victoriametrics-operator` | v0.73.1 | 24 | 2026-07-08 |
<!-- versions:end -->

## Documentation

- [Flux Schema CLI](https://github.com/fluxcd/flux-schema): the validator this catalog serves.
- [Manifest validation guide](https://github.com/fluxcd/flux-schema/blob/main/docs/manifests-validation.md): flags, schema resolution, CEL rules and config files.
- [Custom catalog guide](https://github.com/fluxcd/flux-schema/blob/main/docs/custom-schema-catalog.md): extract and host your own schemas.
