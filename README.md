#  Kubernetes Ecosystem Schema Catalog

<!-- stats:start -->
![Projects](https://img.shields.io/badge/Projects-96-2088FF?style=flat-square) ![Schemas](https://img.shields.io/badge/Schemas-8%2C346-3FB950?style=flat-square) ![Catalog size](https://img.shields.io/badge/Catalog%20size-563%20MB-8957E5?style=flat-square)
<!-- stats:end -->

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

## Catalog

<!-- versions:start -->
| Project | Version | Schemas | Updated |
| --- | --- | --- | --- |
| Kubernetes | [v1.36.2](build/history/kubernetes.json) | 191 | 2026-07-05 |
| OpenShift | [v4.20](build/history/openshift.json) | 256 | 2026-07-05 |
| Flux | [v2.9.0](build/history/flux.json) | 15 | 2026-07-05 |
| Flagger | [v1.43.0](build/history/flagger.json) | 3 | 2026-07-05 |
| Flux Operator | [v0.53.0](build/history/flux-operator.json) | 4 | 2026-07-05 |
| Cluster API | [v1.13.3](build/history/cluster-api.json) | 36 | 2026-07-05 |
| Cluster API Operator | [v0.27.0](build/history/cluster-api-operator.json) | 7 | 2026-07-05 |
| Cluster API Add-on Provider Helm | [v0.6.4](build/history/cluster-api-addon-provider-helm.json) | 2 | 2026-07-05 |
| Gateway API | [v1.6.0](build/history/gateway-api.json) | 19 | 2026-07-05 |
| Cert Manager | [v1.20.3](build/history/cert-manager.json) | 6 | 2026-07-05 |
| Trust Manager | [v0.24.0](build/history/trust-manager.json) | 2 | 2026-07-05 |
| External Secrets | [v2.7.0](build/history/external-secrets.json) | 28 | 2026-07-05 |
| Cilium | [v1.19.5](build/history/cilium.json) | 29 | 2026-07-05 |
| Prometheus Operator | [v0.92.1](build/history/prometheus-operator.json) | 10 | 2026-07-05 |
| VictoriaMetrics Operator | [v0.72.0](build/history/victoriametrics-operator.json) | 24 | 2026-07-05 |
| Fluent Operator | [v3.9.0](build/history/fluent-operator.json) | 22 | 2026-07-05 |
| KEDA | [v2.20.1](build/history/keda.json) | 6 | 2026-07-05 |
| Knative Serving | [knative-v1.22.1](build/history/knative-serving.json) | 12 | 2026-07-05 |
| Knative Eventing | [knative-v1.22.2](build/history/knative-eventing.json) | 20 | 2026-07-05 |
| Tekton Pipeline | [v1.14.0](build/history/tekton-pipeline.json) | 14 | 2026-07-05 |
| Kyverno | [v1.18.1](build/history/kyverno.json) | 47 | 2026-07-05 |
| Rook | [v1.20.1](build/history/rook.json) | 21 | 2026-07-05 |
| Vitess Operator | [v2.17.0](build/history/vitess-operator.json) | 8 | 2026-07-05 |
| Strimzi | [0.51.0](build/history/strimzi.json) | 24 | 2026-07-05 |
| NATS | [v0.23.0](build/history/nats.json) | 8 | 2026-07-05 |
| OpenTelemetry | [v0.154.0](build/history/opentelemetry.json) | 5 | 2026-07-05 |
| OPA Gatekeeper | [v3.22.2](build/history/gatekeeper.json) | 27 | 2026-07-05 |
| Envoy Gateway | [v1.8.2](build/history/envoy-gateway.json) | 8 | 2026-07-05 |
| Longhorn | [v1.12.0](build/history/longhorn.json) | 23 | 2026-07-05 |
| Vertical Pod Autoscaler | [vertical-pod-autoscaler-1.7.0](build/history/vertical-pod-autoscaler.json) | 4 | 2026-07-05 |
| Kueue | [v0.18.2](build/history/kueue.json) | 22 | 2026-07-05 |
| CloudNativePG | [v1.30.0](build/history/cloudnative-pg.json) | 11 | 2026-07-05 |
| Secrets Store CSI Driver | [v1.6.0](build/history/secrets-store-csi-driver.json) | 4 | 2026-07-05 |
| Velero | [v1.18.2](build/history/velero.json) | 11 | 2026-07-05 |
| Crossplane | [v2.3.3](build/history/crossplane.json) | 25 | 2026-07-05 |
| Upbound AWS Provider | [v2.6.0](build/history/provider-upjet-aws.json) | 2364 | 2026-07-05 |
| Upbound Azure Provider | [v2.6.0](build/history/provider-upjet-azure.json) | 1789 | 2026-07-05 |
| Upbound GCP Provider | [v2.6.0](build/history/provider-upjet-gcp.json) | 1018 | 2026-07-05 |
| AWS S3 Controller | [v1.7.1](build/history/ack-s3.json) | 1 | 2026-07-05 |
| AWS RDS Controller | [v1.10.0](build/history/ack-rds.json) | 10 | 2026-07-05 |
| AWS EC2 Controller | [v1.17.0](build/history/ack-ec2.json) | 20 | 2026-07-05 |
| AWS IAM Controller | [v1.7.2](build/history/ack-iam.json) | 7 | 2026-07-05 |
| AWS DynamoDB Controller | [v1.9.1](build/history/ack-dynamodb.json) | 3 | 2026-07-05 |
| AWS Lambda Controller | [v1.14.0](build/history/ack-lambda.json) | 7 | 2026-07-05 |
| AWS EKS Controller | [v1.16.1](build/history/ack-eks.json) | 8 | 2026-07-05 |
| AWS ECR Controller | [v1.6.2](build/history/ack-ecr.json) | 3 | 2026-07-05 |
| AWS SNS Controller | [v1.7.0](build/history/ack-sns.json) | 4 | 2026-07-05 |
| AWS SQS Controller | [v1.5.3](build/history/ack-sqs.json) | 1 | 2026-07-05 |
| AWS ElastiCache Controller | [v1.5.1](build/history/ack-elasticache.json) | 9 | 2026-07-05 |
| AWS KMS Controller | [v1.3.2](build/history/ack-kms.json) | 3 | 2026-07-05 |
| AWS Secrets Manager Controller | [v1.3.1](build/history/ack-secretsmanager.json) | 1 | 2026-07-05 |
| AWS SageMaker Controller | [v1.8.1](build/history/ack-sagemaker.json) | 26 | 2026-07-05 |
| AWS MemoryDB Controller | [v1.4.0](build/history/ack-memorydb.json) | 6 | 2026-07-05 |
| AWS Kinesis Controller | [v1.3.1](build/history/ack-kinesis.json) | 1 | 2026-07-05 |
| AWS ACM Controller | [v1.4.1](build/history/ack-acm.json) | 1 | 2026-07-05 |
| AWS Route 53 Controller | [v1.4.3](build/history/ack-route53.json) | 3 | 2026-07-05 |
| AWS EFS Controller | [v1.4.0](build/history/ack-efs.json) | 3 | 2026-07-05 |
| AWS API Gateway v2 Controller | [v1.3.2](build/history/ack-apigatewayv2.json) | 9 | 2026-07-05 |
| Azure Service Operator | [v2.20.0](build/history/azure-service-operator.json) | 1324 | 2026-07-05 |
| GCP Config Connector | [v1.152.0](build/history/config-connector.json) | 548 | 2026-07-05 |
| Karpenter | [v1.13.0](build/history/karpenter.json) | 3 | 2026-07-05 |
| Karpenter AWS | [v1.13.0](build/history/karpenter-aws.json) | 1 | 2026-07-05 |
| Karpenter Azure | [v1.13.1](build/history/karpenter-azure.json) | 2 | 2026-07-05 |
| Karpenter Cluster API | [v0.2.0](build/history/karpenter-provider-cluster-api.json) | 1 | 2026-07-05 |
| Karpenter IBM Cloud | [v1.0.4](build/history/karpenter-provider-ibm-cloud.json) | 1 | 2026-07-05 |
| SPIRE Controller Manager | [v0.6.6](build/history/spire-controller-manager.json) | 4 | 2026-07-05 |
| Argo CD | [v3.4.4](build/history/argo-cd.json) | 3 | 2026-07-05 |
| Argo Rollouts | [v1.9.0](build/history/argo-rollouts.json) | 5 | 2026-07-05 |
| Argo Workflows | [v4.0.6](build/history/argo-workflows.json) | 8 | 2026-07-05 |
| Argo Events | [v1.9.10](build/history/argo-events.json) | 3 | 2026-07-05 |
| Dapr | [v1.18.1](build/history/dapr.json) | 8 | 2026-07-05 |
| KServe | [v0.19.0](build/history/kserve.json) | 6 | 2026-07-05 |
| KServe LLM | [v0.19.0](build/history/kserve-llmisvc.json) | 4 | 2026-07-05 |
| Volcano | [v1.15.0](build/history/volcano.json) | 9 | 2026-07-05 |
| Volcano JobFlow | [v1.15.0](build/history/volcano-jobflow.json) | 2 | 2026-07-05 |
| Capsule | [v0.13.8](build/history/capsule.json) | 12 | 2026-07-05 |
| JobSet | [v0.12.0](build/history/jobset.json) | 1 | 2026-07-05 |
| LeaderWorkerSet | [v0.9.0](build/history/lws.json) | 2 | 2026-07-05 |
| Node Feature Discovery | [v0.18.3](build/history/node-feature-discovery.json) | 3 | 2026-07-05 |
| NFD NodeResourceTopology | [v0.18.3](build/history/node-feature-discovery-nrt.json) | 2 | 2026-07-05 |
| KWOK | [v0.8.0](build/history/kwok.json) | 12 | 2026-07-05 |
| Network Policy API | [v0.2.0](build/history/network-policy-api.json) | 1 | 2026-07-05 |
| ExternalDNS | [v0.21.0](build/history/external-dns.json) | 1 | 2026-07-05 |
| AWS Load Balancer Controller | [v3.4.0](build/history/aws-load-balancer-controller.json) | 8 | 2026-07-05 |
| kro | [v0.9.2](build/history/kro.json) | 2 | 2026-07-05 |
| Container Object Storage Interface | [v0.2.2](build/history/cosi.json) | 5 | 2026-07-05 |
| kjob | [v0.1.0](build/history/kjob.json) | 5 | 2026-07-05 |
| Istio | [1.30.2](build/history/istio.json) | 33 | 2026-07-05 |
| KubeEdge | [v1.23.0](build/history/kubeedge.json) | 18 | 2026-07-05 |
| OpenFeature Operator | [v0.9.2](build/history/open-feature-operator.json) | 9 | 2026-07-05 |
| OpenReports | [v0.2.1](build/history/openreports.json) | 2 | 2026-07-05 |
| RabbitMQ Cluster Operator | [v2.22.0](build/history/rabbitmq-cluster-operator.json) | 1 | 2026-07-05 |
| Redis Operator | [v0.25.0](build/history/redis-operator.json) | 4 | 2026-07-05 |
| ScyllaDB Operator | [v1.21.0](build/history/scylla-operator.json) | 11 | 2026-07-05 |
| Calico | [v3.32.1](build/history/calico.json) | 22 | 2026-07-05 |
| Tigera Operator | [v3.32.1](build/history/tigera-operator.json) | 9 | 2026-07-05 |
<!-- versions:end -->

## Documentation

- [Flux Schema CLI](https://github.com/fluxcd/flux-schema): the validator this catalog serves.
- [Manifest validation guide](https://github.com/fluxcd/flux-schema/blob/main/docs/manifests-validation.md): flags, schema resolution, CEL rules and config files.
- [Custom catalog guide](https://github.com/fluxcd/flux-schema/blob/main/docs/custom-schema-catalog.md): extract and host your own schemas.
