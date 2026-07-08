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

Each project's ID links to its provenance manifest, which pins the upstream
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
| Kubernetes | [`kubernetes`](https://schemas.fluxoperator.dev/history/kubernetes.json) | v1.36.2 | 101 | 2026-07-08 |
| OpenShift | [`openshift`](https://schemas.fluxoperator.dev/history/openshift.json) | v4.20 | 133 | 2026-07-08 |

### Provisioning

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| 1Password Operator | [`onepassword-operator`](https://schemas.fluxoperator.dev/history/onepassword-operator.json) | v1.12.0 | 1 | 2026-07-08 |
| AWS ACM Controller | [`ack-acm`](https://schemas.fluxoperator.dev/history/ack-acm.json) | v1.4.3 | 1 | 2026-07-08 |
| AWS API Gateway v2 Controller | [`ack-apigatewayv2`](https://schemas.fluxoperator.dev/history/ack-apigatewayv2.json) | v1.3.3 | 9 | 2026-07-08 |
| AWS DynamoDB Controller | [`ack-dynamodb`](https://schemas.fluxoperator.dev/history/ack-dynamodb.json) | v1.9.2 | 3 | 2026-07-08 |
| AWS EC2 Controller | [`ack-ec2`](https://schemas.fluxoperator.dev/history/ack-ec2.json) | v1.18.1 | 20 | 2026-07-08 |
| AWS ECR Controller | [`ack-ecr`](https://schemas.fluxoperator.dev/history/ack-ecr.json) | v1.6.3 | 3 | 2026-07-08 |
| AWS EFS Controller | [`ack-efs`](https://schemas.fluxoperator.dev/history/ack-efs.json) | v1.4.1 | 3 | 2026-07-08 |
| AWS EKS Controller | [`ack-eks`](https://schemas.fluxoperator.dev/history/ack-eks.json) | v1.16.2 | 8 | 2026-07-08 |
| AWS ElastiCache Controller | [`ack-elasticache`](https://schemas.fluxoperator.dev/history/ack-elasticache.json) | v1.5.2 | 9 | 2026-07-08 |
| AWS IAM Controller | [`ack-iam`](https://schemas.fluxoperator.dev/history/ack-iam.json) | v1.7.3 | 7 | 2026-07-08 |
| AWS Kinesis Controller | [`ack-kinesis`](https://schemas.fluxoperator.dev/history/ack-kinesis.json) | v1.3.2 | 1 | 2026-07-08 |
| AWS KMS Controller | [`ack-kms`](https://schemas.fluxoperator.dev/history/ack-kms.json) | v1.3.3 | 3 | 2026-07-08 |
| AWS Lambda Controller | [`ack-lambda`](https://schemas.fluxoperator.dev/history/ack-lambda.json) | v1.14.1 | 7 | 2026-07-08 |
| AWS MemoryDB Controller | [`ack-memorydb`](https://schemas.fluxoperator.dev/history/ack-memorydb.json) | v1.4.1 | 6 | 2026-07-08 |
| AWS RDS Controller | [`ack-rds`](https://schemas.fluxoperator.dev/history/ack-rds.json) | v1.10.1 | 10 | 2026-07-08 |
| AWS Route 53 Controller | [`ack-route53`](https://schemas.fluxoperator.dev/history/ack-route53.json) | v1.4.4 | 3 | 2026-07-08 |
| AWS S3 Controller | [`ack-s3`](https://schemas.fluxoperator.dev/history/ack-s3.json) | v1.8.1 | 1 | 2026-07-08 |
| AWS SageMaker Controller | [`ack-sagemaker`](https://schemas.fluxoperator.dev/history/ack-sagemaker.json) | v1.8.2 | 26 | 2026-07-08 |
| AWS Secrets Manager Controller | [`ack-secretsmanager`](https://schemas.fluxoperator.dev/history/ack-secretsmanager.json) | v1.3.2 | 1 | 2026-07-08 |
| AWS SNS Controller | [`ack-sns`](https://schemas.fluxoperator.dev/history/ack-sns.json) | v1.7.1 | 4 | 2026-07-08 |
| AWS SQS Controller | [`ack-sqs`](https://schemas.fluxoperator.dev/history/ack-sqs.json) | v1.5.4 | 1 | 2026-07-08 |
| Azure Service Operator | [`azure-service-operator`](https://schemas.fluxoperator.dev/history/azure-service-operator.json) | v2.20.0 | 1324 | 2026-07-08 |
| Capsule | [`capsule`](https://schemas.fluxoperator.dev/history/capsule.json) | v0.13.9 | 12 | 2026-07-08 |
| Cert Manager | [`cert-manager`](https://schemas.fluxoperator.dev/history/cert-manager.json) | v1.20.3 | 6 | 2026-07-08 |
| Cluster API | [`cluster-api`](https://schemas.fluxoperator.dev/history/cluster-api.json) | v1.13.3 | 36 | 2026-07-08 |
| Cluster API Add-on Provider Helm | [`cluster-api-addon-provider-helm`](https://schemas.fluxoperator.dev/history/cluster-api-addon-provider-helm.json) | v0.6.4 | 2 | 2026-07-08 |
| Cluster API OpenStack | [`cluster-api-provider-openstack`](https://schemas.fluxoperator.dev/history/cluster-api-provider-openstack.json) | v0.14.6 | 7 | 2026-07-08 |
| Cluster API Operator | [`cluster-api-operator`](https://schemas.fluxoperator.dev/history/cluster-api-operator.json) | v0.27.0 | 7 | 2026-07-08 |
| Cluster API vSphere | [`cluster-api-provider-vsphere`](https://schemas.fluxoperator.dev/history/cluster-api-provider-vsphere.json) | v1.16.1 | 16 | 2026-07-08 |
| Crossplane | [`crossplane`](https://schemas.fluxoperator.dev/history/crossplane.json) | v2.3.3 | 25 | 2026-07-08 |
| External Secrets | [`external-secrets`](https://schemas.fluxoperator.dev/history/external-secrets.json) | v2.7.0 | 28 | 2026-07-08 |
| Falco Operator | [`falco-operator`](https://schemas.fluxoperator.dev/history/falco-operator.json) | v0.4.1 | 5 | 2026-07-08 |
| GCP Config Connector | [`config-connector`](https://schemas.fluxoperator.dev/history/config-connector.json) | v1.153.0 | 578 | 2026-07-08 |
| kro | [`kro`](https://schemas.fluxoperator.dev/history/kro.json) | v0.9.2 | 2 | 2026-07-08 |
| Kubescape Operator | [`kubescape-operator`](https://schemas.fluxoperator.dev/history/kubescape-operator.json) | 1.40.2 | 5 | 2026-07-08 |
| Kubewarden | [`kubewarden`](https://schemas.fluxoperator.dev/history/kubewarden.json) | v1.36.0 | 8 | 2026-07-08 |
| Kyverno | [`kyverno`](https://schemas.fluxoperator.dev/history/kyverno.json) | v1.18.1 | 47 | 2026-07-08 |
| OPA Gatekeeper | [`gatekeeper`](https://schemas.fluxoperator.dev/history/gatekeeper.json) | v3.22.2 | 27 | 2026-07-08 |
| OpenReports | [`openreports`](https://schemas.fluxoperator.dev/history/openreports.json) | v0.2.1 | 2 | 2026-07-08 |
| Secrets Store CSI Driver | [`secrets-store-csi-driver`](https://schemas.fluxoperator.dev/history/secrets-store-csi-driver.json) | v1.6.0 | 4 | 2026-07-08 |
| Sigstore Policy Controller | [`sigstore-policy-controller`](https://schemas.fluxoperator.dev/history/sigstore-policy-controller.json) | v0.15.1 | 3 | 2026-07-08 |
| SPIRE Controller Manager | [`spire-controller-manager`](https://schemas.fluxoperator.dev/history/spire-controller-manager.json) | v0.6.6 | 4 | 2026-07-08 |
| Trust Manager | [`trust-manager`](https://schemas.fluxoperator.dev/history/trust-manager.json) | v0.24.0 | 2 | 2026-07-08 |
| Upbound AWS Provider | [`provider-upjet-aws`](https://schemas.fluxoperator.dev/history/provider-upjet-aws.json) | v2.6.0 | 2364 | 2026-07-08 |
| Upbound Azure Provider | [`provider-upjet-azure`](https://schemas.fluxoperator.dev/history/provider-upjet-azure.json) | v2.6.0 | 1789 | 2026-07-08 |
| Upbound GCP Provider | [`provider-upjet-gcp`](https://schemas.fluxoperator.dev/history/provider-upjet-gcp.json) | v2.6.0 | 1018 | 2026-07-08 |

### Runtime

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| Antrea | [`antrea`](https://schemas.fluxoperator.dev/history/antrea.json) | v2.6.2 | 20 | 2026-07-08 |
| Calico | [`calico`](https://schemas.fluxoperator.dev/history/calico.json) | v3.32.1 | 22 | 2026-07-08 |
| Cilium | [`cilium`](https://schemas.fluxoperator.dev/history/cilium.json) | v1.19.5 | 29 | 2026-07-08 |
| Container Object Storage Interface | [`cosi`](https://schemas.fluxoperator.dev/history/cosi.json) | v0.2.2 | 5 | 2026-07-08 |
| Kube-OVN | [`kube-ovn`](https://schemas.fluxoperator.dev/history/kube-ovn.json) | v1.16.2 | 24 | 2026-07-08 |
| Longhorn | [`longhorn`](https://schemas.fluxoperator.dev/history/longhorn.json) | v1.12.0 | 23 | 2026-07-08 |
| Network Policy API | [`network-policy-api`](https://schemas.fluxoperator.dev/history/network-policy-api.json) | v0.2.0 | 1 | 2026-07-08 |
| Rook | [`rook`](https://schemas.fluxoperator.dev/history/rook.json) | v1.20.2 | 21 | 2026-07-08 |
| Submariner | [`submariner`](https://schemas.fluxoperator.dev/history/submariner.json) | v0.24.0 | 9 | 2026-07-08 |
| Submariner Operator | [`submariner-operator`](https://schemas.fluxoperator.dev/history/submariner-operator.json) | v0.24.0 | 3 | 2026-07-08 |
| Tailscale | [`tailscale`](https://schemas.fluxoperator.dev/history/tailscale.json) | v1.98.8 | 7 | 2026-07-08 |
| Tigera Operator | [`tigera-operator`](https://schemas.fluxoperator.dev/history/tigera-operator.json) | v3.32.1 | 9 | 2026-07-08 |
| Velero | [`velero`](https://schemas.fluxoperator.dev/history/velero.json) | v1.18.2 | 11 | 2026-07-08 |

### Orchestration & Management

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| AWS Load Balancer Controller | [`aws-load-balancer-controller`](https://schemas.fluxoperator.dev/history/aws-load-balancer-controller.json) | v3.4.1 | 8 | 2026-07-08 |
| Envoy Gateway | [`envoy-gateway`](https://schemas.fluxoperator.dev/history/envoy-gateway.json) | v1.8.2 | 8 | 2026-07-08 |
| ExternalDNS | [`external-dns`](https://schemas.fluxoperator.dev/history/external-dns.json) | v0.21.0 | 1 | 2026-07-08 |
| Gateway API | [`gateway-api`](https://schemas.fluxoperator.dev/history/gateway-api.json) | v1.6.0 | 21 | 2026-07-08 |
| Istio | [`istio`](https://schemas.fluxoperator.dev/history/istio.json) | 1.30.2 | 33 | 2026-07-08 |
| JobSet | [`jobset`](https://schemas.fluxoperator.dev/history/jobset.json) | v0.12.0 | 1 | 2026-07-08 |
| Karpenter | [`karpenter`](https://schemas.fluxoperator.dev/history/karpenter.json) | v1.13.0 | 3 | 2026-07-08 |
| Karpenter AWS | [`karpenter-aws`](https://schemas.fluxoperator.dev/history/karpenter-aws.json) | v1.13.0 | 1 | 2026-07-08 |
| Karpenter Azure | [`karpenter-azure`](https://schemas.fluxoperator.dev/history/karpenter-azure.json) | v1.13.1 | 2 | 2026-07-08 |
| Karpenter Cluster API | [`karpenter-provider-cluster-api`](https://schemas.fluxoperator.dev/history/karpenter-provider-cluster-api.json) | v0.2.0 | 1 | 2026-07-08 |
| Karpenter IBM Cloud | [`karpenter-provider-ibm-cloud`](https://schemas.fluxoperator.dev/history/karpenter-provider-ibm-cloud.json) | v1.0.4 | 1 | 2026-07-08 |
| KEDA | [`keda`](https://schemas.fluxoperator.dev/history/keda.json) | v2.20.1 | 6 | 2026-07-08 |
| kgateway | [`kgateway`](https://schemas.fluxoperator.dev/history/kgateway.json) | v2.3.5 | 8 | 2026-07-08 |
| kjob | [`kjob`](https://schemas.fluxoperator.dev/history/kjob.json) | v0.1.0 | 5 | 2026-07-08 |
| KubeEdge | [`kubeedge`](https://schemas.fluxoperator.dev/history/kubeedge.json) | v1.23.0 | 18 | 2026-07-08 |
| Kueue | [`kueue`](https://schemas.fluxoperator.dev/history/kueue.json) | v0.18.2 | 22 | 2026-07-08 |
| KWOK | [`kwok`](https://schemas.fluxoperator.dev/history/kwok.json) | v0.8.0 | 12 | 2026-07-08 |
| LeaderWorkerSet | [`lws`](https://schemas.fluxoperator.dev/history/lws.json) | v0.9.0 | 2 | 2026-07-08 |
| NFD NodeResourceTopology | [`node-feature-discovery-nrt`](https://schemas.fluxoperator.dev/history/node-feature-discovery-nrt.json) | v0.18.3 | 2 | 2026-07-08 |
| Node Feature Discovery | [`node-feature-discovery`](https://schemas.fluxoperator.dev/history/node-feature-discovery.json) | v0.18.3 | 3 | 2026-07-08 |
| Vertical Pod Autoscaler | [`vertical-pod-autoscaler`](https://schemas.fluxoperator.dev/history/vertical-pod-autoscaler.json) | 1.7.0 | 4 | 2026-07-08 |
| Volcano | [`volcano`](https://schemas.fluxoperator.dev/history/volcano.json) | v1.15.0 | 9 | 2026-07-08 |
| Volcano JobFlow | [`volcano-jobflow`](https://schemas.fluxoperator.dev/history/volcano-jobflow.json) | v1.15.0 | 2 | 2026-07-08 |

### App Definition & Development

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| Actions Runner Controller | [`actions-runner-controller`](https://schemas.fluxoperator.dev/history/actions-runner-controller.json) | 0.14.2 | 9 | 2026-07-08 |
| Argo CD | [`argo-cd`](https://schemas.fluxoperator.dev/history/argo-cd.json) | v3.4.4 | 3 | 2026-07-08 |
| Argo Events | [`argo-events`](https://schemas.fluxoperator.dev/history/argo-events.json) | v1.9.10 | 3 | 2026-07-08 |
| Argo Rollouts | [`argo-rollouts`](https://schemas.fluxoperator.dev/history/argo-rollouts.json) | v1.9.0 | 5 | 2026-07-08 |
| Argo Workflows | [`argo-workflows`](https://schemas.fluxoperator.dev/history/argo-workflows.json) | v4.0.7 | 8 | 2026-07-08 |
| CloudNativePG | [`cloudnative-pg`](https://schemas.fluxoperator.dev/history/cloudnative-pg.json) | v1.30.0 | 11 | 2026-07-08 |
| Dapr | [`dapr`](https://schemas.fluxoperator.dev/history/dapr.json) | v1.18.1 | 8 | 2026-07-08 |
| Flagger | [`flagger`](https://schemas.fluxoperator.dev/history/flagger.json) | v1.43.0 | 3 | 2026-07-08 |
| Flux | [`flux`](https://schemas.fluxoperator.dev/history/flux.json) | v2.9.1 | 15 | 2026-07-08 |
| Flux Operator | [`flux-operator`](https://schemas.fluxoperator.dev/history/flux-operator.json) | v0.54.0 | 4 | 2026-07-08 |
| Kargo | [`kargo`](https://schemas.fluxoperator.dev/history/kargo.json) | v1.10.8 | 9 | 2026-07-08 |
| Knative Eventing | [`knative-eventing`](https://schemas.fluxoperator.dev/history/knative-eventing.json) | v1.22.2 | 20 | 2026-07-08 |
| Knative Serving | [`knative-serving`](https://schemas.fluxoperator.dev/history/knative-serving.json) | v1.22.1 | 12 | 2026-07-08 |
| KServe | [`kserve`](https://schemas.fluxoperator.dev/history/kserve.json) | v0.19.0 | 6 | 2026-07-08 |
| KServe LLM | [`kserve-llmisvc`](https://schemas.fluxoperator.dev/history/kserve-llmisvc.json) | v0.19.0 | 4 | 2026-07-08 |
| MariaDB Operator | [`mariadb-operator`](https://schemas.fluxoperator.dev/history/mariadb-operator.json) | 26.6.0 | 12 | 2026-07-08 |
| NATS | [`nats`](https://schemas.fluxoperator.dev/history/nats.json) | v0.23.0 | 8 | 2026-07-08 |
| OpenFeature Operator | [`open-feature-operator`](https://schemas.fluxoperator.dev/history/open-feature-operator.json) | v0.9.2 | 9 | 2026-07-08 |
| RabbitMQ Cluster Operator | [`rabbitmq-cluster-operator`](https://schemas.fluxoperator.dev/history/rabbitmq-cluster-operator.json) | v2.22.1 | 1 | 2026-07-08 |
| Redis Operator | [`redis-operator`](https://schemas.fluxoperator.dev/history/redis-operator.json) | v0.25.0 | 4 | 2026-07-08 |
| ScyllaDB Operator | [`scylla-operator`](https://schemas.fluxoperator.dev/history/scylla-operator.json) | v1.21.0 | 11 | 2026-07-08 |
| Strimzi | [`strimzi`](https://schemas.fluxoperator.dev/history/strimzi.json) | 0.51.0 | 24 | 2026-07-08 |
| Tekton Pipeline | [`tekton-pipeline`](https://schemas.fluxoperator.dev/history/tekton-pipeline.json) | v1.14.0 | 14 | 2026-07-08 |
| Vitess Operator | [`vitess-operator`](https://schemas.fluxoperator.dev/history/vitess-operator.json) | v2.17.0 | 8 | 2026-07-08 |

### Observability & Analysis

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| Datadog Operator | [`datadog-operator`](https://schemas.fluxoperator.dev/history/datadog-operator.json) | v1.28.0 | 13 | 2026-07-08 |
| Elastic Cloud | [`eck-operator`](https://schemas.fluxoperator.dev/history/eck-operator.json) | v3.4.1 | 19 | 2026-07-08 |
| Fluent Operator | [`fluent-operator`](https://schemas.fluxoperator.dev/history/fluent-operator.json) | v3.9.0 | 22 | 2026-07-08 |
| Grafana Operator | [`grafana-operator`](https://schemas.fluxoperator.dev/history/grafana-operator.json) | v5.24.0 | 13 | 2026-07-08 |
| Jaeger Operator | [`jaeger-operator`](https://schemas.fluxoperator.dev/history/jaeger-operator.json) | v1.65.0 | 1 | 2026-07-08 |
| Litmus | [`litmus`](https://schemas.fluxoperator.dev/history/litmus.json) | 3.30.0 | 3 | 2026-07-08 |
| Logging Operator | [`logging-operator`](https://schemas.fluxoperator.dev/history/logging-operator.json) | 6.7.0 | 21 | 2026-07-08 |
| Loki Operator | [`loki-operator`](https://schemas.fluxoperator.dev/history/loki-operator.json) | v0.10.2 | 9 | 2026-07-08 |
| OpenSearch Operator | [`opensearch-operator`](https://schemas.fluxoperator.dev/history/opensearch-operator.json) | 3.0.2 | 20 | 2026-07-08 |
| OpenTelemetry | [`opentelemetry`](https://schemas.fluxoperator.dev/history/opentelemetry.json) | v0.154.0 | 5 | 2026-07-08 |
| Perses Operator | [`perses-operator`](https://schemas.fluxoperator.dev/history/perses-operator.json) | v0.4.0 | 7 | 2026-07-08 |
| Prometheus Operator | [`prometheus-operator`](https://schemas.fluxoperator.dev/history/prometheus-operator.json) | v0.92.1 | 10 | 2026-07-08 |
| Tempo Operator | [`tempo-operator`](https://schemas.fluxoperator.dev/history/tempo-operator.json) | v0.21.0 | 2 | 2026-07-08 |
| VictoriaMetrics Operator | [`victoriametrics-operator`](https://schemas.fluxoperator.dev/history/victoriametrics-operator.json) | v0.73.0 | 24 | 2026-07-08 |
<!-- versions:end -->

## Documentation

- [Flux Schema CLI](https://github.com/fluxcd/flux-schema): the validator this catalog serves.
- [Manifest validation guide](https://github.com/fluxcd/flux-schema/blob/main/docs/manifests-validation.md): flags, schema resolution, CEL rules and config files.
- [Custom catalog guide](https://github.com/fluxcd/flux-schema/blob/main/docs/custom-schema-catalog.md): extract and host your own schemas.
