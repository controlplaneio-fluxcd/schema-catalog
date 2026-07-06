// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

import type { CatalogIndex } from "../../shared/types.ts";
import { CLI_URL, createBreadcrumb, createCodeBlock, createPage, kindCount, link, text } from "../dom.ts";
import { agentsRoute, homeRoute } from "../router.ts";

const DOCS_URL = "https://fluxcd.io/flux/cli-plugins/flux-schema/";

const INSTALL_COMMAND = "flux plugin install schema";

const VALIDATE_COMMAND = `flux schema validate ./manifests \\
  --schema-location https://schemas.fluxoperator.dev/catalog`;

const RENDERED_COMMAND = "kustomize build ./clusters/production | flux schema validate --verbose";

const EXAMPLE_OUTPUT = `$ flux schema validate ./manifests

manifests/releases.yaml - HelmRelease/apps/frontend is invalid: cel violation
  - /spec: Invalid value: either 'chart' or 'chartRef' must be set
manifests/sources.yaml - Bucket/apps/frontend-config is invalid: schema violation
  - /spec: missing property 'bucketName'
  - /spec/interval: got number, want string
  - /spec: additional properties 'force' not allowed
Summary: 5 resources found in 2 files - Valid: 3, Invalid: 2, Skipped: 0`;

const CI_CONFIG = `apiVersion: schema.plugin.fluxcd.io/v1beta1
kind: Config
validate:
  schemaLocation:
    - https://schemas.fluxoperator.dev/catalog`;

const CI_WORKFLOW = `name: flux-schema

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Setup Flux with Schema plugin
        uses: fluxcd/flux2/action@main
        with:
          plugins: |
            schema
      - name: Validate manifests
        uses: fluxcd/flux-schema/actions/validate@main
        with:
          helm-charts: "true"`;

const CHECKS: Array<{ title: string; body: string }> = [
  {
    title: "API server semantics",
    body:
      "Every field of every kind is checked strictly: unknown fields, wrong types, and missing required properties are reported as schema violations.",
  },
  {
    title: "CEL rules",
    body:
      "The x-kubernetes-validations rules embedded in CRDs run with the same engine as the Kubernetes API server. A HelmRelease missing both chart and chartRef fails locally, not on the cluster.",
  },
  {
    title: "Strict YAML decoding",
    body:
      "Duplicate keys are rejected, matching Flux behavior, and names, namespaces, labels, and annotations are checked against API server rules (DNS-1123, qualified names).",
  },
  {
    title: "SOPS-aware",
    body:
      "SOPS metadata fields can be stripped before validation, so encrypted Secrets are checked without decryption.",
  },
];

/**
 * Renders the CLI page: validating manifests in CI with the flux-schema
 * plugin, using this catalog as a schema location. The AI-agent story lives on
 * the agents page; this page links there once and stays on CI.
 */
export function renderCli(index: CatalogIndex): HTMLElement {
  const page = createPage("cli-page");
  page.append(
    createBreadcrumb([{ label: "Home", href: homeRoute() }, { label: "CLI" }]),
    createHero(),
    createCatalogSection(index),
    createChecksSection(),
    createCiSection(),
    createAgentsPointer(),
  );
  return page;
}

function createHero(): HTMLElement {
  const hero = document.createElement("section");
  hero.className = "hero mcp-hero";

  hero.append(
    text("h1", "", "Flux Schema CLI"),
    text(
      "p",
      "mcp-tagline",
      "Static validation for GitOps workflows with Kubernetes API server semantics. Catch invalid manifests in pull requests, before Flux reconciles them on clusters.",
    ),
    createCodeBlock(INSTALL_COMMAND),
    createMetaLine(),
  );
  return hero;
}

function createMetaLine(): HTMLElement {
  const meta = document.createElement("p");
  meta.className = "mcp-meta";

  const repo = link(CLI_URL, "fluxcd/flux-schema");
  repo.target = "_blank";
  repo.rel = "noopener noreferrer";
  const docs = link(DOCS_URL, "documentation");
  docs.target = "_blank";
  docs.rel = "noopener noreferrer";

  meta.append(
    document.createTextNode("Apache-2.0 · single Go binary · Flux CLI plugin · "),
    repo,
    document.createTextNode(" · "),
    docs,
  );
  return meta;
}

function createCatalogSection(index: CatalogIndex): HTMLElement {
  const kinds = index.projects.reduce((total, project) => total + kindCount(project), 0);

  const section = createSection("Validate against this catalog");
  section.append(
    text(
      "p",
      "mcp-lead",
      `One schema location covers ${index.projects.length.toLocaleString("en-US")} projects and ${kinds.toLocaleString("en-US")} kinds, the plugin's built-in catalog included.`,
    ),
    createCodeBlock(VALIDATE_COMMAND),
    text("h3", "", "Validate what Flux sees"),
    text(
      "p",
      "mcp-lead",
      "Pipe rendered kustomize overlays or Helm charts through the same check: the exact manifests Flux applies at reconciliation time.",
    ),
    createCodeBlock(RENDERED_COMMAND),
    text("h3", "", "Violations, pinpointed"),
    createCodeBlock(EXAMPLE_OUTPUT, "console"),
  );
  return section;
}

function createChecksSection(): HTMLElement {
  const section = createSection("What it checks");

  const grid = document.createElement("div");
  grid.className = "mcp-features";
  for (const check of CHECKS) {
    const card = document.createElement("div");
    card.className = "mcp-feature";
    card.append(text("h3", "", check.title), text("p", "", check.body));
    grid.append(card);
  }
  section.append(grid);
  return section;
}

function createCiSection(): HTMLElement {
  const section = createSection("Run it in CI");
  section.append(
    text(
      "p",
      "mcp-lead",
      "For GitHub repositories, two composite actions cover the pipeline: one installs the CLI, the other renders kustomize overlays and Helm charts and validates every document.",
    ),
    createCodeBlock(CI_WORKFLOW, "yaml"),
    text("h3", "", "Point CI at this catalog"),
    text(
      "p",
      "mcp-lead",
      "The validate action reads .fluxschema.yml from the repository root. Set this catalog as the schema location:",
    ),
    createCodeBlock(CI_CONFIG, "yaml"),
    text(
      "p",
      "mcp-lead",
      "For other CI systems and air-gapped environments, the ghcr.io/fluxcd/flux-schema container image bundles the entire catalog, so validation runs without network access.",
    ),
  );
  return section;
}

function createAgentsPointer(): HTMLElement {
  const section = createSection("Writing manifests with an AI agent?");
  const lead = document.createElement("p");
  lead.className = "mcp-lead";
  lead.append(
    document.createTextNode("The same catalog is served to agents over MCP, see "),
    link(agentsRoute(), "AI Agents"),
    document.createTextNode("."),
  );
  section.append(lead);
  return section;
}

function createSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "mcp-section";
  section.append(text("h2", "", title));
  return section;
}
