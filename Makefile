.PHONY: deps lint test build web-build web-sync web-deploy web-run

deps:
	cd build && bun install

lint:
	cd build && bunx tsc -p tsconfig.json --noEmit

test:
	cd build && bun test

build:
	cd build && bun src/main.ts build $(if $(FORCE_BUILD),--force) $(if $(BUILD_SUMMARY),--summary $(BUILD_SUMMARY))

# Workers Builds runs these from the repo root (CF build command: make web-build,
# deploy command: make web-sync web-deploy). WORKERS_CI_COMMIT_SHA is injected by
# CF; local runs fall back to git HEAD for the cache-busting CATALOG_VERSION.
WORKERS_CI_COMMIT_SHA ?= $(shell git rev-parse HEAD)
RCLONE_VERSION := v1.74.3
RCLONE := $(or $(shell command -v rclone 2>/dev/null),/tmp/rclone-$(RCLONE_VERSION)-linux-amd64/rclone)
BUN_VERSION := 1.3.14
BUN_DIR := /tmp/bun-$(BUN_VERSION)

# The CF build image's Bun is too old for this build (Bun.YAML needs >= 1.2.21)
# and the image ignores its own BUN_VERSION build variable, so when the ambient
# Bun does not match the pin, install the exact version into a versioned /tmp
# prefix (never touching ~/.bun) and put it first on PATH for the whole build.
web-build:
	@[ "$$(bun --version 2>/dev/null)" = "$(BUN_VERSION)" ] || [ -x "$(BUN_DIR)/bin/bun" ] || (echo "Bun $(BUN_VERSION) required; installing to $(BUN_DIR)" && curl -fsSL https://bun.sh/install | BUN_INSTALL="$(BUN_DIR)" bash -s "bun-v$(BUN_VERSION)")
	@export PATH="$(BUN_DIR)/bin:$$PATH" && cd web && bun install --frozen-lockfile && bun run lint && bun test && bun run build

# Needs RCLONE_CONFIG_R2_* env vars pointing at the R2 bucket's S3 endpoint;
# the CF build image has no rclone, so fetch the pinned static binary when missing.
web-sync:
	@env | sort | grep -o '^RCLONE_CONFIG_R2_[A-Z_]*' || echo "no RCLONE_CONFIG_R2_* vars in env"
	@test -x "$(RCLONE)" || (curl -fsSL https://downloads.rclone.org/$(RCLONE_VERSION)/rclone-$(RCLONE_VERSION)-linux-amd64.zip -o /tmp/rclone.zip && unzip -oq /tmp/rclone.zip -d /tmp)
	$(RCLONE) sync catalog r2:schema-catalog --checksum --fast-list --transfers 32 --stats-one-line -v

web-deploy:
	cd web && bunx wrangler deploy --var CATALOG_VERSION:$(WORKERS_CI_COMMIT_SHA)

# Run the Worker fully locally (no Cloudflare credentials): the UI and MCP on
# http://localhost:8787, with /catalog/* served from the local catalog/ tree.
web-run:
	cd web && bun install --frozen-lockfile && bun run build && bun scripts/dev.ts
