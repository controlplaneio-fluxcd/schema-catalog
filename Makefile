# Copyright 2026 Stefan Prodan.
# SPDX-License-Identifier: AGPL-3.0

# Makefile for building the schema catalog and deploying the web app + mcp at https://schemas.fluxoperator.dev

# Setting SHELL to bash allows bash commands to be executed by recipes.
# Options are set to exit when a recipe line exits non-zero or a piped command fails.
SHELL = /usr/bin/env bash -o pipefail
.SHELLFLAGS = -ec

# A bare `make` prints the help instead of running the full catalog build.
.DEFAULT_GOAL := help

.PHONY: all
all: deps lint test build ## Run all catalog build and test targets.

##@ Catalog

.PHONY: deps
deps: ## Install the build system dependencies.
	cd build && bun install

.PHONY: lint
lint: ## Run the TypeScript compiler checks on the build system.
	cd build && bunx tsc -p tsconfig.json --noEmit

.PHONY: test
test: ## Run the build system unit tests.
	cd build && bun test

.PHONY: build
build: ## Build the schema catalog (FORCE_BUILD=1 forces, BUILD_SUMMARY=<path> writes a summary, RUN_TO_COMPLETION=1 reports failures, CONCURRENT=<n> sets parallelism).
	cd build && bun src/main.ts build $(if $(FORCE_BUILD),--force) $(if $(BUILD_SUMMARY),--summary $(BUILD_SUMMARY)) $(if $(RUN_TO_COMPLETION),--run-to-completion) $(if $(CONCURRENT),--concurrent $(CONCURRENT))

##@ Web

# Workers Builds runs the web targets from the repo root (CF build command:
# make web-build, deploy command: make web-sync web-deploy).
# WORKERS_CI_COMMIT_SHA is injected by CF; local runs fall back to git HEAD
# for the cache-busting CATALOG_VERSION.
WORKERS_CI_COMMIT_SHA ?= $(shell git rev-parse HEAD)
RCLONE_VERSION := v1.74.3
RCLONE := $(or $(shell command -v rclone 2>/dev/null),/tmp/rclone-$(RCLONE_VERSION)-linux-amd64/rclone)

.PHONY: web-build
web-build: ## Install, lint, test and bundle the web app.
	# The web lint and index generator type-check ../build/src (gen-index.ts
	# imports the config parser and history readers), so the build system's
	# dev dependencies must be installed too or tsc resolves the wrong types.
	cd build && bun install --frozen-lockfile
	cd web && bun install --frozen-lockfile && bun run lint && bun test && bun run build

.PHONY: web-dev
web-dev: ## Serve the UI on :8787 without wrangler; watches src and live-reloads (no /mcp).
	cd web && bun run build && bun scripts/serve.ts

.PHONY: web-run
web-run: ## Run the Worker locally on :8787 without CF credentials.
	cd web && bun install --frozen-lockfile && bun run build && bun scripts/dev.ts

.PHONY: web-sync
web-sync: ## Sync catalog/ to the R2 bucket (needs RCLONE_CONFIG_R2_* env vars).
	@env | sort | grep -o '^RCLONE_CONFIG_R2_[A-Z_]*' || echo "no RCLONE_CONFIG_R2_* vars in env"
	@test -x "$(RCLONE)" || (curl -fsSL https://downloads.rclone.org/$(RCLONE_VERSION)/rclone-$(RCLONE_VERSION)-linux-amd64.zip -o /tmp/rclone.zip && unzip -oq /tmp/rclone.zip -d /tmp)
	$(RCLONE) sync catalog r2:schema-catalog --checksum --fast-list --transfers 32 --stats-one-line -v

.PHONY: web-deploy
web-deploy: ## Deploy the Worker with the commit SHA as CATALOG_VERSION.
	cd web && bunx wrangler deploy --var CATALOG_VERSION:$(WORKERS_CI_COMMIT_SHA)

##@ General

.PHONY: help
help: ## Display this help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
