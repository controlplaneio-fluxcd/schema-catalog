#  Kubernetes Ecosystem Schema Catalog

<!-- stats:start -->
![Projects](https://img.shields.io/badge/Projects-115-2088FF?style=flat-square) ![Schemas](https://img.shields.io/badge/Schemas-8%2C867-3FB950?style=flat-square) ![Catalog size](https://img.shields.io/badge/Catalog%20size-634%20MB-8957E5?style=flat-square)
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

The catalog also keeps versioned snapshots for the six most recent minor
releases of Kubernetes, OpenShift and Flux, so validation can be pinned to
the minors your clusters run; see
[Kubernetes versioning](https://schemas.fluxoperator.dev/cli#versions).

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
| [Kubernetes](https://schemas.fluxoperator.dev/p/kubernetes) | `kubernetes` | v1.36.2 | 101 | 2026-07-09 |
| [OpenShift](https://schemas.fluxoperator.dev/p/openshift) | `openshift` | v4.22 | 138 | 2026-07-10 |

### Provisioning

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [1Password Operator](https://schemas.fluxoperator.dev/p/onepassword-operator) | `onepassword-operator` | v1.12.0 | 1 | 2026-07-09 |
| [AWS ACM Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-acm` | v1.5.0 | 1 | 2026-07-21 |
| [AWS API Gateway v2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-apigatewayv2` | v1.3.3 | 9 | 2026-07-09 |
| [AWS CloudFront Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-cloudfront` | v1.6.0 | 9 | 2026-07-21 |
| [AWS CloudWatch Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-cloudwatch` | v1.6.1 | 3 | 2026-07-09 |
| [AWS CloudWatch Logs Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-cloudwatchlogs` | v1.3.2 | 1 | 2026-07-09 |
| [AWS DynamoDB Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-dynamodb` | v1.9.2 | 3 | 2026-07-09 |
| [AWS EC2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-ec2` | v1.18.2 | 20 | 2026-07-09 |
| [AWS ECR Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-ecr` | v1.7.0 | 3 | 2026-07-17 |
| [AWS EFS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-efs` | v1.4.1 | 3 | 2026-07-09 |
| [AWS EKS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-eks` | v1.16.2 | 8 | 2026-07-09 |
| [AWS Elastic Load Balancing v2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-elbv2` | v1.5.2 | 4 | 2026-07-09 |
| [AWS ElastiCache Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-elasticache` | v1.5.2 | 9 | 2026-07-09 |
| [AWS EventBridge Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-eventbridge` | v1.4.1 | 4 | 2026-07-09 |
| [AWS IAM Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-iam` | v1.7.3 | 7 | 2026-07-09 |
| [AWS Kinesis Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-kinesis` | v1.3.2 | 1 | 2026-07-09 |
| [AWS KMS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-kms` | v1.3.3 | 3 | 2026-07-09 |
| [AWS Lambda Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-lambda` | v1.14.1 | 7 | 2026-07-09 |
| [AWS MemoryDB Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-memorydb` | v1.4.1 | 6 | 2026-07-09 |
| [AWS OpenSearch Service Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-opensearchservice` | v1.4.2 | 1 | 2026-07-09 |
| [AWS Prometheus Service Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-prometheusservice` | v1.5.2 | 4 | 2026-07-09 |
| [AWS RDS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-rds` | v1.10.1 | 10 | 2026-07-09 |
| [AWS Route 53 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-route53` | v1.4.4 | 3 | 2026-07-09 |
| [AWS S3 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-s3` | v1.8.1 | 1 | 2026-07-09 |
| [AWS SageMaker Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sagemaker` | v1.8.3 | 26 | 2026-07-09 |
| [AWS Secrets Manager Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-secretsmanager` | v1.3.2 | 1 | 2026-07-09 |
| [AWS SNS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sns` | v1.7.1 | 4 | 2026-07-09 |
| [AWS SQS Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-sqs` | v1.5.4 | 1 | 2026-07-09 |
| [AWS WAFv2 Controller](https://schemas.fluxoperator.dev/p/aws-ack) | `ack-wafv2` | v1.4.4 | 3 | 2026-07-21 |
| [Azure Service Operator](https://schemas.fluxoperator.dev/p/azure-service-operator) | `azure-service-operator` | v2.20.0 | 1324 | 2026-07-09 |
| [Capsule](https://schemas.fluxoperator.dev/p/capsule) | `capsule` | v0.13.9 | 12 | 2026-07-09 |
| [Cert Manager](https://schemas.fluxoperator.dev/p/cert-manager) | `cert-manager` | v1.21.0 | 6 | 2026-07-09 |
| [Cluster API](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api` | v1.13.4 | 36 | 2026-07-16 |
| [Cluster API Add-on Provider Helm](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-addon-provider-helm` | v0.6.4 | 2 | 2026-07-09 |
| [Cluster API AWS](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-aws` | v2.12.1 | 36 | 2026-07-10 |
| [Cluster API Azure](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-azure` | v1.26.0 | 25 | 2026-07-09 |
| [Cluster API GCP](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-gcp` | v1.12.0 | 13 | 2026-07-09 |
| [Cluster API Hetzner](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-hetzner` | v1.1.7 | 11 | 2026-07-09 |
| [Cluster API k0smotron Bootstrap](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-k0smotron-bootstrap` | v2.0.3 | 6 | 2026-07-09 |
| [Cluster API k0smotron Control Plane](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-k0smotron-control-plane` | v2.0.3 | 12 | 2026-07-09 |
| [Cluster API k0smotron Infrastructure](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-k0smotron-infrastructure` | v2.0.3 | 10 | 2026-07-09 |
| [Cluster API Metal3](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-metal3` | v1.13.1 | 18 | 2026-07-09 |
| [Cluster API Nutanix](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-nutanix` | v1.10.3 | 8 | 2026-07-15 |
| [Cluster API OpenStack](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-openstack` | v0.14.6 | 7 | 2026-07-09 |
| [Cluster API Operator](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-operator` | v0.28.0 | 7 | 2026-07-18 |
| [Cluster API RKE2 Bootstrap](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-rke2-bootstrap` | v0.25.0 | 4 | 2026-07-09 |
| [Cluster API RKE2 Control Plane](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-rke2-control-plane` | v0.25.0 | 4 | 2026-07-09 |
| [Cluster API vSphere](https://schemas.fluxoperator.dev/p/cluster-api) | `cluster-api-provider-vsphere` | v1.16.1 | 16 | 2026-07-09 |
| [Crossplane](https://schemas.fluxoperator.dev/p/crossplane) | `crossplane` | v2.3.3 | 25 | 2026-07-09 |
| [External Secrets](https://schemas.fluxoperator.dev/p/external-secrets) | `external-secrets` | v2.8.0 | 29 | 2026-07-18 |
| [Falco Operator](https://schemas.fluxoperator.dev/p/falco-operator) | `falco-operator` | v0.4.1 | 5 | 2026-07-09 |
| [GCP Config Connector](https://schemas.fluxoperator.dev/p/config-connector) | `config-connector` | v1.153.0 | 578 | 2026-07-09 |
| [Image Scanner Operator](https://schemas.fluxoperator.dev/p/image-scanner-operator) | `image-scanner-operator` | v0.16.21 | 1 | 2026-07-10 |
| [kro](https://schemas.fluxoperator.dev/p/kro) | `kro` | v0.9.2 | 2 | 2026-07-09 |
| [Kubescape Operator](https://schemas.fluxoperator.dev/p/kubescape-operator) | `kubescape-operator` | 1.40.2 | 5 | 2026-07-09 |
| [Kubewarden](https://schemas.fluxoperator.dev/p/kubewarden) | `kubewarden` | v1.36.0 | 8 | 2026-07-09 |
| [Kyverno](https://schemas.fluxoperator.dev/p/kyverno) | `kyverno` | v1.18.2 | 47 | 2026-07-10 |
| [OPA Gatekeeper](https://schemas.fluxoperator.dev/p/gatekeeper) | `gatekeeper` | v3.23.0 | 27 | 2026-07-09 |
| [OpenReports](https://schemas.fluxoperator.dev/p/openreports) | `openreports` | v0.2.1 | 2 | 2026-07-09 |
| [Rancher Elemental Operator](https://schemas.fluxoperator.dev/p/rancher-elemental-operator) | `rancher-elemental-operator` | v1.9.2 | 9 | 2026-07-10 |
| [Rancher Turtles](https://schemas.fluxoperator.dev/p/rancher-turtles) | `rancher-turtles` | v0.26.3 | 2 | 2026-07-10 |
| [Sealed Secrets](https://schemas.fluxoperator.dev/p/sealed-secrets) | `sealed-secrets` | v0.38.4 | 1 | 2026-07-09 |
| [Secrets Store CSI Driver](https://schemas.fluxoperator.dev/p/secrets-store-csi-driver) | `secrets-store-csi-driver` | v1.6.0 | 4 | 2026-07-09 |
| [Sigstore Policy Controller](https://schemas.fluxoperator.dev/p/sigstore-policy-controller) | `sigstore-policy-controller` | v0.15.1 | 3 | 2026-07-09 |
| [SPIRE Controller Manager](https://schemas.fluxoperator.dev/p/spire-controller-manager) | `spire-controller-manager` | v0.6.6 | 4 | 2026-07-09 |
| [Trust Manager](https://schemas.fluxoperator.dev/p/trust-manager) | `trust-manager` | v0.24.0 | 2 | 2026-07-09 |
| [Upbound AWS Provider](https://schemas.fluxoperator.dev/p/provider-upjet-aws) | `provider-upjet-aws` | v2.6.0 | 2364 | 2026-07-09 |
| [Upbound Azure Provider](https://schemas.fluxoperator.dev/p/provider-upjet-azure) | `provider-upjet-azure` | v2.6.0 | 1789 | 2026-07-09 |
| [Upbound GCP Provider](https://schemas.fluxoperator.dev/p/provider-upjet-gcp) | `provider-upjet-gcp` | v2.6.0 | 1018 | 2026-07-09 |

### Runtime

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Antrea](https://schemas.fluxoperator.dev/p/antrea) | `antrea` | v2.6.2 | 20 | 2026-07-09 |
| [Calico](https://schemas.fluxoperator.dev/p/calico) | `calico` | v3.32.1 | 22 | 2026-07-09 |
| [Cilium](https://schemas.fluxoperator.dev/p/cilium) | `cilium` | v1.19.6 | 29 | 2026-07-17 |
| [Container Object Storage Interface](https://schemas.fluxoperator.dev/p/cosi) | `cosi` | v0.2.2 | 5 | 2026-07-09 |
| [CSI External Snapshotter](https://schemas.fluxoperator.dev/p/external-snapshotter) | `external-snapshotter` | v8.6.0 | 15 | 2026-07-09 |
| [Kube-OVN](https://schemas.fluxoperator.dev/p/kube-ovn) | `kube-ovn` | v1.16.2 | 24 | 2026-07-09 |
| [Longhorn](https://schemas.fluxoperator.dev/p/longhorn) | `longhorn` | v1.12.0 | 23 | 2026-07-09 |
| [Multi-Cluster Services API](https://schemas.fluxoperator.dev/p/mcs-api) | `mcs-api` | v0.5.2 | 4 | 2026-07-14 |
| [Multus CNI](https://schemas.fluxoperator.dev/p/multus-cni) | `multus-cni` | v4.3.0 | 1 | 2026-07-09 |
| [Network Policy API](https://schemas.fluxoperator.dev/p/network-policy-api) | `network-policy-api` | v0.2.0 | 1 | 2026-07-09 |
| [NVIDIA GPU Operator](https://schemas.fluxoperator.dev/p/nvidia-gpu-operator) | `nvidia-gpu-operator` | v26.3.3 | 2 | 2026-07-09 |
| [NVIDIA Network Operator](https://schemas.fluxoperator.dev/p/nvidia-network-operator) | `nvidia-network-operator` | v26.1.2 | 4 | 2026-07-18 |
| [Rook](https://schemas.fluxoperator.dev/p/rook) | `rook` | v1.20.2 | 21 | 2026-07-09 |
| [Skupper](https://schemas.fluxoperator.dev/p/skupper) | `skupper` | 2.2.1 | 12 | 2026-07-09 |
| [Spiderpool](https://schemas.fluxoperator.dev/p/spiderpool) | `spiderpool` | v1.2.2 | 6 | 2026-07-09 |
| [Submariner](https://schemas.fluxoperator.dev/p/submariner) | `submariner` | v0.24.0 | 9 | 2026-07-09 |
| [Submariner Operator](https://schemas.fluxoperator.dev/p/submariner) | `submariner-operator` | v0.24.0 | 3 | 2026-07-09 |
| [Tailscale](https://schemas.fluxoperator.dev/p/tailscale) | `tailscale` | v1.98.9 | 7 | 2026-07-21 |
| [Tigera Operator](https://schemas.fluxoperator.dev/p/calico) | `tigera-operator` | v3.32.1 | 9 | 2026-07-09 |
| [Velero](https://schemas.fluxoperator.dev/p/velero) | `velero` | v1.18.2 | 11 | 2026-07-09 |

### Orchestration & Management

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Agentgateway](https://schemas.fluxoperator.dev/p/agentgateway) | `agentgateway` | v1.4.0-alpha.2 | 3 | 2026-07-21 |
| [AWS Load Balancer Controller](https://schemas.fluxoperator.dev/p/aws-load-balancer-controller) | `aws-load-balancer-controller` | v3.4.2 | 8 | 2026-07-14 |
| [Cluster Inventory API](https://schemas.fluxoperator.dev/p/cluster-inventory-api) | `cluster-inventory-api` | v0.1.3 | 2 | 2026-07-09 |
| [Envoy Gateway](https://schemas.fluxoperator.dev/p/envoy-gateway) | `envoy-gateway` | v1.8.2 | 8 | 2026-07-09 |
| [ExternalDNS](https://schemas.fluxoperator.dev/p/external-dns) | `external-dns` | v0.21.0 | 1 | 2026-07-09 |
| [Gateway API](https://schemas.fluxoperator.dev/p/gateway-api) | `gateway-api` | v1.6.1 | 21 | 2026-07-17 |
| [Gateway API Inference Extension](https://schemas.fluxoperator.dev/p/gateway-api-inference-extension) | `gateway-api-inference-extension` | v1.5.0 | 4 | 2026-07-09 |
| [Istio](https://schemas.fluxoperator.dev/p/istio) | `istio` | 1.30.3 | 33 | 2026-07-17 |
| [JobSet](https://schemas.fluxoperator.dev/p/jobset) | `jobset` | v0.12.0 | 1 | 2026-07-09 |
| [Karmada](https://schemas.fluxoperator.dev/p/karmada) | `karmada` | v1.18.1 | 19 | 2026-07-09 |
| [Karpenter](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter` | v1.14.0 | 4 | 2026-07-11 |
| [Karpenter AWS](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-aws` | v1.14.0 | 1 | 2026-07-18 |
| [Karpenter Azure](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-azure` | v1.14.0 | 2 | 2026-07-18 |
| [Karpenter Cluster API](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-provider-cluster-api` | v0.2.0 | 1 | 2026-07-09 |
| [Karpenter IBM Cloud](https://schemas.fluxoperator.dev/p/karpenter) | `karpenter-provider-ibm-cloud` | v1.0.5 | 1 | 2026-07-14 |
| [KEDA](https://schemas.fluxoperator.dev/p/keda) | `keda` | v2.20.1 | 6 | 2026-07-09 |
| [kgateway](https://schemas.fluxoperator.dev/p/kgateway) | `kgateway` | v2.3.6 | 8 | 2026-07-14 |
| [kjob](https://schemas.fluxoperator.dev/p/kjob) | `kjob` | v0.1.0 | 5 | 2026-07-09 |
| [KubeEdge](https://schemas.fluxoperator.dev/p/kubeedge) | `kubeedge` | v1.23.1 | 18 | 2026-07-16 |
| [KubeRay](https://schemas.fluxoperator.dev/p/kuberay) | `kuberay` | v1.6.2 | 7 | 2026-07-09 |
| [Kueue](https://schemas.fluxoperator.dev/p/kueue) | `kueue` | v0.18.3 | 22 | 2026-07-11 |
| [Kuma](https://schemas.fluxoperator.dev/p/kuma) | `kuma` | v2.14.1 | 54 | 2026-07-16 |
| [KWOK](https://schemas.fluxoperator.dev/p/kwok) | `kwok` | v0.8.0 | 12 | 2026-07-09 |
| [LeaderWorkerSet](https://schemas.fluxoperator.dev/p/lws) | `lws` | v0.9.0 | 2 | 2026-07-09 |
| [Linkerd](https://schemas.fluxoperator.dev/p/linkerd) | `linkerd` | 26.6.3 | 19 | 2026-07-09 |
| [MetalLB](https://schemas.fluxoperator.dev/p/metallb) | `metallb` | v0.16.0 | 10 | 2026-07-09 |
| [NFD NodeResourceTopology](https://schemas.fluxoperator.dev/p/node-feature-discovery) | `node-feature-discovery-nrt` | v0.19.0 | 2 | 2026-07-11 |
| [Node Feature Discovery](https://schemas.fluxoperator.dev/p/node-feature-discovery) | `node-feature-discovery` | v0.19.0 | 3 | 2026-07-11 |
| [Rancher System Upgrade Controller](https://schemas.fluxoperator.dev/p/rancher-system-upgrade-controller) | `rancher-system-upgrade-controller` | v0.19.2 | 1 | 2026-07-10 |
| [Traefik](https://schemas.fluxoperator.dev/p/traefik) | `traefik` | v3.7.8 | 10 | 2026-07-16 |
| [Vertical Pod Autoscaler](https://schemas.fluxoperator.dev/p/vertical-pod-autoscaler) | `vertical-pod-autoscaler` | 1.7.0 | 4 | 2026-07-09 |
| [Volcano](https://schemas.fluxoperator.dev/p/volcano) | `volcano` | v1.15.0 | 9 | 2026-07-09 |
| [Volcano JobFlow](https://schemas.fluxoperator.dev/p/volcano) | `volcano-jobflow` | v1.15.0 | 2 | 2026-07-09 |

### App Definition & Development

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Actions Runner Controller](https://schemas.fluxoperator.dev/p/actions-runner-controller) | `actions-runner-controller` | 0.14.2 | 9 | 2026-07-09 |
| [AIBrix](https://schemas.fluxoperator.dev/p/aibrix) | `aibrix` | v0.7.0 | 8 | 2026-07-09 |
| [Argo CD](https://schemas.fluxoperator.dev/p/argo) | `argo-cd` | v3.4.5 | 3 | 2026-07-10 |
| [Argo Events](https://schemas.fluxoperator.dev/p/argo) | `argo-events` | v1.9.11 | 3 | 2026-07-14 |
| [Argo Rollouts](https://schemas.fluxoperator.dev/p/argo) | `argo-rollouts` | v1.9.1 | 5 | 2026-07-18 |
| [Argo Workflows](https://schemas.fluxoperator.dev/p/argo) | `argo-workflows` | v4.0.7 | 8 | 2026-07-09 |
| [CloudNativePG](https://schemas.fluxoperator.dev/p/cloudnative-pg) | `cloudnative-pg` | v1.30.0 | 11 | 2026-07-09 |
| [Crunchy Postgres Operator](https://schemas.fluxoperator.dev/p/crunchy-postgres-operator) | `crunchy-postgres-operator` | v6.0.2 | 4 | 2026-07-09 |
| [Dapr](https://schemas.fluxoperator.dev/p/dapr) | `dapr` | v1.18.1 | 8 | 2026-07-09 |
| [Flagger](https://schemas.fluxoperator.dev/p/flagger) | `flagger` | v1.44.0 | 3 | 2026-07-21 |
| [Flux](https://schemas.fluxoperator.dev/p/flux) | `flux` | v2.9.2 | 15 | 2026-07-14 |
| [Flux Operator](https://schemas.fluxoperator.dev/p/flux-operator) | `flux-operator` | v0.55.0 | 4 | 2026-07-14 |
| [k3s Helm Controller](https://schemas.fluxoperator.dev/p/k3s-helm-controller) | `k3s-helm-controller` | v0.17.5 | 2 | 2026-07-17 |
| [Kargo](https://schemas.fluxoperator.dev/p/kargo) | `kargo` | v1.10.9 | 9 | 2026-07-15 |
| [Knative Eventing](https://schemas.fluxoperator.dev/p/knative) | `knative-eventing` | v1.22.2 | 20 | 2026-07-09 |
| [Knative Serving](https://schemas.fluxoperator.dev/p/knative) | `knative-serving` | v1.22.1 | 12 | 2026-07-09 |
| [KServe](https://schemas.fluxoperator.dev/p/kserve) | `kserve` | v0.19.0 | 6 | 2026-07-09 |
| [KServe LLM](https://schemas.fluxoperator.dev/p/kserve) | `kserve-llmisvc` | v0.19.0 | 4 | 2026-07-09 |
| [Kubeflow Notebooks](https://schemas.fluxoperator.dev/p/kubeflow) | `notebook-controller` | v1.11.0 | 3 | 2026-07-09 |
| [Kubeflow Pipelines](https://schemas.fluxoperator.dev/p/kubeflow) | `kubeflow-pipelines` | 2.17.0 | 2 | 2026-07-10 |
| [Kubeflow PodDefaults](https://schemas.fluxoperator.dev/p/kubeflow) | `poddefaults-webhook` | v2.0.0 | 1 | 2026-07-09 |
| [Kubeflow Profiles](https://schemas.fluxoperator.dev/p/kubeflow) | `profile-controller` | v2.0.0 | 2 | 2026-07-09 |
| [Kubeflow PVCViewer](https://schemas.fluxoperator.dev/p/kubeflow) | `pvcviewer-controller` | v1.11.0 | 1 | 2026-07-09 |
| [Kubeflow Tensorboard](https://schemas.fluxoperator.dev/p/kubeflow) | `tensorboard-controller` | v1.11.0 | 1 | 2026-07-09 |
| [Kubeflow Trainer](https://schemas.fluxoperator.dev/p/kubeflow) | `kubeflow-trainer` | v2.2.1 | 3 | 2026-07-09 |
| [MariaDB Operator](https://schemas.fluxoperator.dev/p/mariadb-operator) | `mariadb-operator` | 26.6.0 | 12 | 2026-07-09 |
| [MPI Operator](https://schemas.fluxoperator.dev/p/kubeflow) | `mpi-operator` | v0.8.2 | 1 | 2026-07-09 |
| [NATS](https://schemas.fluxoperator.dev/p/nats) | `nats` | v0.23.0 | 8 | 2026-07-09 |
| [OpenFeature Operator](https://schemas.fluxoperator.dev/p/open-feature-operator) | `open-feature-operator` | v0.9.2 | 9 | 2026-07-09 |
| [OpenKruise](https://schemas.fluxoperator.dev/p/openkruise) | `openkruise` | v1.9.1 | 26 | 2026-07-09 |
| [RabbitMQ Cluster Operator](https://schemas.fluxoperator.dev/p/rabbitmq-cluster-operator) | `rabbitmq-cluster-operator` | v2.22.3 | 1 | 2026-07-18 |
| [Rancher Fleet](https://schemas.fluxoperator.dev/p/rancher-fleet) | `rancher-fleet` | v0.15.4 | 14 | 2026-07-10 |
| [Redis Operator](https://schemas.fluxoperator.dev/p/redis-operator) | `redis-operator` | v0.26.0 | 4 | 2026-07-16 |
| [Renovate Operator](https://schemas.fluxoperator.dev/p/renovate-operator) | `renovate-operator` | 5.2.0 | 1 | 2026-07-19 |
| [ScyllaDB Operator](https://schemas.fluxoperator.dev/p/scylla-operator) | `scylla-operator` | v1.21.0 | 11 | 2026-07-09 |
| [Seldon Core v2](https://schemas.fluxoperator.dev/p/seldon-core) | `seldon-core` | v2.10.2 | 7 | 2026-07-09 |
| [Spark Operator](https://schemas.fluxoperator.dev/p/kubeflow) | `spark-operator` | v2.5.1 | 3 | 2026-07-09 |
| [Strimzi](https://schemas.fluxoperator.dev/p/strimzi) | `strimzi` | 0.51.0 | 24 | 2026-07-09 |
| [Tekton Pipeline](https://schemas.fluxoperator.dev/p/tekton-pipeline) | `tekton-pipeline` | v1.14.0 | 14 | 2026-07-09 |
| [Vitess Operator](https://schemas.fluxoperator.dev/p/vitess-operator) | `vitess-operator` | v2.17.0 | 8 | 2026-07-09 |

### Observability & Analysis

| Project | ID | Version | Schemas | Updated |
| --- | --- | --- | --- | --- |
| [Datadog Operator](https://schemas.fluxoperator.dev/p/datadog-operator) | `datadog-operator` | v1.28.0 | 13 | 2026-07-09 |
| [Elastic Cloud](https://schemas.fluxoperator.dev/p/eck-operator) | `eck-operator` | v3.4.1 | 19 | 2026-07-09 |
| [Fluent Operator](https://schemas.fluxoperator.dev/p/fluent-operator) | `fluent-operator` | v3.9.0 | 22 | 2026-07-09 |
| [Grafana Operator](https://schemas.fluxoperator.dev/p/grafana-operator) | `grafana-operator` | v5.24.0 | 13 | 2026-07-09 |
| [Jaeger Operator](https://schemas.fluxoperator.dev/p/jaeger-operator) | `jaeger-operator` | v1.65.0 | 1 | 2026-07-09 |
| [Litmus](https://schemas.fluxoperator.dev/p/litmus) | `litmus` | 3.31.0 | 3 | 2026-07-16 |
| [Logging Operator](https://schemas.fluxoperator.dev/p/logging-operator) | `logging-operator` | 6.7.0 | 21 | 2026-07-09 |
| [Loki Operator](https://schemas.fluxoperator.dev/p/loki-operator) | `loki-operator` | v0.10.2 | 9 | 2026-07-09 |
| [OpenSearch Operator](https://schemas.fluxoperator.dev/p/opensearch-operator) | `opensearch-operator` | 3.0.2 | 20 | 2026-07-09 |
| [OpenTelemetry Operator](https://schemas.fluxoperator.dev/p/opentelemetry) | `opentelemetry` | v0.156.0 | 5 | 2026-07-15 |
| [Perses Operator](https://schemas.fluxoperator.dev/p/perses-operator) | `perses-operator` | v0.4.0 | 7 | 2026-07-09 |
| [Prometheus Operator](https://schemas.fluxoperator.dev/p/prometheus-operator) | `prometheus-operator` | v0.92.1 | 10 | 2026-07-09 |
| [Tempo Operator](https://schemas.fluxoperator.dev/p/tempo-operator) | `tempo-operator` | v0.21.0 | 2 | 2026-07-09 |
| [VictoriaMetrics Operator](https://schemas.fluxoperator.dev/p/victoriametrics-operator) | `victoriametrics-operator` | v0.73.1 | 24 | 2026-07-09 |
<!-- versions:end -->

## Documentation

- [Flux Schema CLI](https://github.com/fluxcd/flux-schema): the validator this catalog serves.
- [Manifest validation guide](https://github.com/fluxcd/flux-schema/blob/main/docs/manifests-validation.md): flags, schema resolution, CEL rules and config files.
- [Custom catalog guide](https://github.com/fluxcd/flux-schema/blob/main/docs/custom-schema-catalog.md): extract and host your own schemas.
